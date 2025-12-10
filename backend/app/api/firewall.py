from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel, Field

from ..core.database import get_db
from ..core.dependencies import get_current_user, require_permission
from ..models.firewall_rule import FirewallRule
from ..models.user import User
from ..services.proxmox import ProxmoxService

router = APIRouter(prefix="/firewall", tags=["firewall"])


# Pydantic models
class FirewallRuleBase(BaseModel):
    type: str = Field(..., description="Rule type: 'in' or 'out'")
    action: str = Field(..., description="Action: ACCEPT, DROP, or REJECT")
    enabled: bool = Field(default=True, description="Whether rule is enabled")
    protocol: Optional[str] = Field(None, description="Protocol: tcp, udp, icmp, or any")
    source: Optional[str] = Field(None, description="Source IP/CIDR")
    dest: Optional[str] = Field(None, description="Destination IP/CIDR")
    sport: Optional[str] = Field(None, description="Source port or range")
    dport: Optional[str] = Field(None, description="Destination port or range")
    iface: Optional[str] = Field(None, description="Network interface")
    comment: Optional[str] = Field(None, description="Rule comment")
    log: Optional[str] = Field(None, description="Log level: nolog, info, warning, err")
    macro: Optional[str] = Field(None, description="Predefined macro")


class FirewallRuleCreate(FirewallRuleBase):
    pos: Optional[int] = Field(None, description="Position in rule list")


class FirewallRuleUpdate(BaseModel):
    type: Optional[str] = None
    action: Optional[str] = None
    enabled: Optional[bool] = None
    protocol: Optional[str] = None
    source: Optional[str] = None
    dest: Optional[str] = None
    sport: Optional[str] = None
    dport: Optional[str] = None
    iface: Optional[str] = None
    comment: Optional[str] = None
    log: Optional[str] = None
    macro: Optional[str] = None
    pos: Optional[int] = None


class FirewallRuleResponse(FirewallRuleBase):
    id: int
    vmid: int
    node_id: int
    pos: Optional[int]
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class FirewallOptionsBase(BaseModel):
    enable: bool = Field(default=False, description="Enable VM firewall")
    dhcp: bool = Field(default=True, description="Allow DHCP")
    ipfilter: bool = Field(default=False, description="Enable IP filter")
    log_level_in: str = Field(default="nolog", description="Inbound log level")
    log_level_out: str = Field(default="nolog", description="Outbound log level")
    macfilter: bool = Field(default=False, description="Enable MAC filter")
    ndp: bool = Field(default=True, description="Allow NDP")
    policy_in: str = Field(default="DROP", description="Default inbound policy")
    policy_out: str = Field(default="ACCEPT", description="Default outbound policy")
    radv: bool = Field(default=False, description="Allow router advertisements")


class FirewallOptionsResponse(FirewallOptionsBase):
    pass


@router.get(
    "/node/{node_id}/vm/{vmid}/rules",
    response_model=List[FirewallRuleResponse],
    summary="List VM firewall rules"
)
@require_permission("firewall", "read")
async def list_firewall_rules(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all firewall rules for a VM."""
    # Get rules from database
    result = await db.execute(
        select(FirewallRule)
        .where(FirewallRule.node_id == node_id, FirewallRule.vmid == vmid)
        .order_by(FirewallRule.pos)
    )
    rules = result.scalars().all()
    
    return [
        FirewallRuleResponse(
            id=rule.id,
            vmid=rule.vmid,
            node_id=rule.node_id,
            type=rule.type,
            action=rule.action,
            enabled=rule.enabled,
            protocol=rule.protocol,
            source=rule.source,
            dest=rule.dest,
            sport=rule.sport,
            dport=rule.dport,
            iface=rule.iface,
            comment=rule.comment,
            log=rule.log,
            macro=rule.macro,
            pos=rule.pos,
            created_at=rule.created_at.isoformat() if rule.created_at else None,
            updated_at=rule.updated_at.isoformat() if rule.updated_at else None
        )
        for rule in rules
    ]


@router.post(
    "/node/{node_id}/vm/{vmid}/rules",
    response_model=FirewallRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create VM firewall rule"
)
@require_permission("firewall", "create")
async def create_firewall_rule(
    node_id: int,
    vmid: int,
    rule_data: FirewallRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new firewall rule for a VM."""
    # Validate rule type
    if rule_data.type not in ["in", "out"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rule type must be 'in' or 'out'"
        )
    
    # Validate action
    if rule_data.action not in ["ACCEPT", "DROP", "REJECT"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action must be ACCEPT, DROP, or REJECT"
        )
    
    # Get Proxmox service
    proxmox = ProxmoxService()
    
    # Prepare rule data for Proxmox
    proxmox_rule = {
        "type": rule_data.type,
        "action": rule_data.action,
        "enable": 1 if rule_data.enabled else 0
    }
    
    # Add optional fields
    if rule_data.protocol:
        proxmox_rule["proto"] = rule_data.protocol
    if rule_data.source:
        proxmox_rule["source"] = rule_data.source
    if rule_data.dest:
        proxmox_rule["dest"] = rule_data.dest
    if rule_data.sport:
        proxmox_rule["sport"] = rule_data.sport
    if rule_data.dport:
        proxmox_rule["dport"] = rule_data.dport
    if rule_data.iface:
        proxmox_rule["iface"] = rule_data.iface
    if rule_data.comment:
        proxmox_rule["comment"] = rule_data.comment
    if rule_data.log:
        proxmox_rule["log"] = rule_data.log
    if rule_data.macro:
        proxmox_rule["macro"] = rule_data.macro
    
    # Create rule in Proxmox
    try:
        node = proxmox.get_node_name_by_id(node_id)
        proxmox_result = proxmox.proxmox.nodes(node).qemu(vmid).firewall.rules.post(**proxmox_rule)
        
        # Get position from Proxmox response (if available)
        pos = rule_data.pos if rule_data.pos is not None else proxmox_result.get('pos')
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create firewall rule in Proxmox: {str(e)}"
        )
    
    # Save to database
    db_rule = FirewallRule(
        vmid=vmid,
        node_id=node_id,
        type=rule_data.type,
        action=rule_data.action,
        enabled=rule_data.enabled,
        protocol=rule_data.protocol,
        source=rule_data.source,
        dest=rule_data.dest,
        sport=rule_data.sport,
        dport=rule_data.dport,
        iface=rule_data.iface,
        comment=rule_data.comment,
        log=rule_data.log,
        macro=rule_data.macro,
        pos=pos,
        created_by_user_id=current_user.id
    )
    
    db.add(db_rule)
    await db.commit()
    await db.refresh(db_rule)
    
    return FirewallRuleResponse(
        id=db_rule.id,
        vmid=db_rule.vmid,
        node_id=db_rule.node_id,
        type=db_rule.type,
        action=db_rule.action,
        enabled=db_rule.enabled,
        protocol=db_rule.protocol,
        source=db_rule.source,
        dest=db_rule.dest,
        sport=db_rule.sport,
        dport=db_rule.dport,
        iface=db_rule.iface,
        comment=db_rule.comment,
        log=db_rule.log,
        macro=db_rule.macro,
        pos=db_rule.pos,
        created_at=db_rule.created_at.isoformat(),
        updated_at=db_rule.updated_at.isoformat() if db_rule.updated_at else None
    )


@router.put(
    "/node/{node_id}/vm/{vmid}/rules/{rule_id}",
    response_model=FirewallRuleResponse,
    summary="Update VM firewall rule"
)
@require_permission("firewall", "update")
async def update_firewall_rule(
    node_id: int,
    vmid: int,
    rule_id: int,
    rule_data: FirewallRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing firewall rule."""
    # Get rule from database
    result = await db.execute(
        select(FirewallRule).where(
            FirewallRule.id == rule_id,
            FirewallRule.node_id == node_id,
            FirewallRule.vmid == vmid
        )
    )
    db_rule = result.scalar_one_or_none()
    
    if not db_rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Firewall rule not found"
        )
    
    # Validate updates
    if rule_data.type and rule_data.type not in ["in", "out"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rule type must be 'in' or 'out'"
        )
    
    if rule_data.action and rule_data.action not in ["ACCEPT", "DROP", "REJECT"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action must be ACCEPT, DROP, or REJECT"
        )
    
    # Prepare update data for Proxmox
    proxmox_update = {}
    
    if rule_data.type:
        proxmox_update["type"] = rule_data.type
    if rule_data.action:
        proxmox_update["action"] = rule_data.action
    if rule_data.enabled is not None:
        proxmox_update["enable"] = 1 if rule_data.enabled else 0
    if rule_data.protocol:
        proxmox_update["proto"] = rule_data.protocol
    if rule_data.source:
        proxmox_update["source"] = rule_data.source
    if rule_data.dest:
        proxmox_update["dest"] = rule_data.dest
    if rule_data.sport:
        proxmox_update["sport"] = rule_data.sport
    if rule_data.dport:
        proxmox_update["dport"] = rule_data.dport
    if rule_data.iface:
        proxmox_update["iface"] = rule_data.iface
    if rule_data.comment:
        proxmox_update["comment"] = rule_data.comment
    if rule_data.log:
        proxmox_update["log"] = rule_data.log
    if rule_data.macro:
        proxmox_update["macro"] = rule_data.macro
    
    # Update in Proxmox
    if proxmox_update:
        try:
            proxmox = ProxmoxService()
            node = proxmox.get_node_name_by_id(node_id)
            
            # Proxmox uses position to identify rules
            if db_rule.pos is not None:
                proxmox.proxmox.nodes(node).qemu(vmid).firewall.rules(db_rule.pos).put(**proxmox_update)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update firewall rule in Proxmox: {str(e)}"
            )
    
    # Update database
    for field, value in rule_data.dict(exclude_unset=True).items():
        setattr(db_rule, field, value)
    
    await db.commit()
    await db.refresh(db_rule)
    
    return FirewallRuleResponse(
        id=db_rule.id,
        vmid=db_rule.vmid,
        node_id=db_rule.node_id,
        type=db_rule.type,
        action=db_rule.action,
        enabled=db_rule.enabled,
        protocol=db_rule.protocol,
        source=db_rule.source,
        dest=db_rule.dest,
        sport=db_rule.sport,
        dport=db_rule.dport,
        iface=db_rule.iface,
        comment=db_rule.comment,
        log=db_rule.log,
        macro=db_rule.macro,
        pos=db_rule.pos,
        created_at=db_rule.created_at.isoformat(),
        updated_at=db_rule.updated_at.isoformat() if db_rule.updated_at else None
    )


@router.delete(
    "/node/{node_id}/vm/{vmid}/rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete VM firewall rule"
)
@require_permission("firewall", "delete")
async def delete_firewall_rule(
    node_id: int,
    vmid: int,
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a firewall rule."""
    # Get rule from database
    result = await db.execute(
        select(FirewallRule).where(
            FirewallRule.id == rule_id,
            FirewallRule.node_id == node_id,
            FirewallRule.vmid == vmid
        )
    )
    db_rule = result.scalar_one_or_none()
    
    if not db_rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Firewall rule not found"
        )
    
    # Delete from Proxmox
    try:
        proxmox = ProxmoxService()
        node = proxmox.get_node_name_by_id(node_id)
        
        if db_rule.pos is not None:
            proxmox.proxmox.nodes(node).qemu(vmid).firewall.rules(db_rule.pos).delete()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete firewall rule from Proxmox: {str(e)}"
        )
    
    # Delete from database
    await db.delete(db_rule)
    await db.commit()
    
    return None


@router.get(
    "/node/{node_id}/vm/{vmid}/options",
    response_model=FirewallOptionsResponse,
    summary="Get VM firewall options"
)
@require_permission("firewall", "read")
async def get_firewall_options(
    node_id: int,
    vmid: int,
    current_user: User = Depends(get_current_user)
):
    """Get VM firewall options/settings."""
    try:
        proxmox = ProxmoxService()
        node = proxmox.get_node_name_by_id(node_id)
        
        # Get firewall options from Proxmox
        options = proxmox.proxmox.nodes(node).qemu(vmid).firewall.options.get()
        
        return FirewallOptionsResponse(
            enable=bool(options.get("enable", 0)),
            dhcp=bool(options.get("dhcp", 1)),
            ipfilter=bool(options.get("ipfilter", 0)),
            log_level_in=options.get("log_level_in", "nolog"),
            log_level_out=options.get("log_level_out", "nolog"),
            macfilter=bool(options.get("macfilter", 0)),
            ndp=bool(options.get("ndp", 1)),
            policy_in=options.get("policy_in", "DROP"),
            policy_out=options.get("policy_out", "ACCEPT"),
            radv=bool(options.get("radv", 0))
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get firewall options from Proxmox: {str(e)}"
        )


@router.put(
    "/node/{node_id}/vm/{vmid}/options",
    response_model=FirewallOptionsResponse,
    summary="Update VM firewall options"
)
@require_permission("firewall", "update")
async def update_firewall_options(
    node_id: int,
    vmid: int,
    options_data: FirewallOptionsBase,
    current_user: User = Depends(get_current_user)
):
    """Update VM firewall options/settings."""
    try:
        proxmox = ProxmoxService()
        node = proxmox.get_node_name_by_id(node_id)
        
        # Prepare options for Proxmox
        proxmox_options = {
            "enable": 1 if options_data.enable else 0,
            "dhcp": 1 if options_data.dhcp else 0,
            "ipfilter": 1 if options_data.ipfilter else 0,
            "log_level_in": options_data.log_level_in,
            "log_level_out": options_data.log_level_out,
            "macfilter": 1 if options_data.macfilter else 0,
            "ndp": 1 if options_data.ndp else 0,
            "policy_in": options_data.policy_in,
            "policy_out": options_data.policy_out,
            "radv": 1 if options_data.radv else 0
        }
        
        # Update in Proxmox
        proxmox.proxmox.nodes(node).qemu(vmid).firewall.options.put(**proxmox_options)
        
        return FirewallOptionsResponse(**options_data.dict())
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update firewall options in Proxmox: {str(e)}"
        )


@router.post(
    "/node/{node_id}/vm/{vmid}/sync",
    response_model=dict,
    summary="Sync firewall rules from Proxmox"
)
@require_permission("firewall", "create")
async def sync_firewall_rules(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sync firewall rules from Proxmox to database."""
    try:
        proxmox = ProxmoxService()
        node = proxmox.get_node_name_by_id(node_id)
        
        # Get rules from Proxmox
        proxmox_rules = proxmox.proxmox.nodes(node).qemu(vmid).firewall.rules.get()
        
        # Delete existing rules in database
        await db.execute(
            delete(FirewallRule).where(
                FirewallRule.node_id == node_id,
                FirewallRule.vmid == vmid
            )
        )
        
        # Insert new rules
        synced_count = 0
        for rule in proxmox_rules:
            db_rule = FirewallRule(
                vmid=vmid,
                node_id=node_id,
                type=rule.get("type"),
                action=rule.get("action"),
                enabled=bool(rule.get("enable", 1)),
                protocol=rule.get("proto"),
                source=rule.get("source"),
                dest=rule.get("dest"),
                sport=rule.get("sport"),
                dport=rule.get("dport"),
                iface=rule.get("iface"),
                comment=rule.get("comment"),
                log=rule.get("log"),
                macro=rule.get("macro"),
                pos=rule.get("pos"),
                created_by_user_id=current_user.id
            )
            db.add(db_rule)
            synced_count += 1
        
        await db.commit()
        
        return {
            "message": "Firewall rules synced successfully",
            "synced_count": synced_count
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync firewall rules: {str(e)}"
        )
