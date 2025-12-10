"""
VNC WebSocket Proxy
Proxies VNC WebSocket connections from the frontend through the backend to Proxmox
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import logging

router = APIRouter(prefix="/vnc", tags=["VNC Proxy"])
logger = logging.getLogger(__name__)


@router.websocket("/proxy/{node_id}/{vmid}")
async def vnc_proxy_websocket(
    websocket: WebSocket,
    node_id: int,
    vmid: int,
    port: str,
    ticket: str
):
    """
    WebSocket proxy endpoint for VNC connections
    Proxies VNC traffic from frontend through backend to Proxmox
    """
    await websocket.accept()
    
    # URL-decode the ticket since it comes URL-encoded from the frontend
    from urllib.parse import unquote
    ticket_decoded = unquote(ticket)
    
    logger.info(f"VNC Proxy request for node {node_id}, VM {vmid}, port {port}")
    logger.info(f"Ticket (first 20 chars): {ticket_decoded[:20]}...")
    
    proxmox_ws = None
    
    try:
        # Get Proxmox cluster/node info to construct the WebSocket URL
        # The ticket and port come from the initial VNC connection request
        from app.core.database import get_db
        from app.models.proxmox_cluster import ProxmoxNode
        from sqlalchemy import select
        
        async for db in get_db():
            # Get the Proxmox node details
            result = await db.execute(
                select(ProxmoxNode).where(ProxmoxNode.id == node_id)
            )
            node = result.scalar_one_or_none()
            
            if not node:
                await websocket.close(code=1008, reason="Node not found")
                return
            
            # Construct Proxmox WebSocket URL
            proxmox_host = node.host
            proxmox_port = node.port
            node_name = node.name
            
            # Construct Proxmox WebSocket URL
            # Format: wss://host:8006/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket?port={vncport}&vncticket={ticket}
            # The 'port' is the VNC port (from vncproxy result), not the Proxmox port
            from urllib.parse import quote
            proxmox_ws_url = (
                f"wss://{proxmox_host}:{proxmox_port}/api2/json/nodes/{node_name}/"
                f"qemu/{vmid}/vncwebsocket?port={port}&vncticket={ticket_decoded}"
            )
            
            logger.info(f"Proxying VNC connection to {proxmox_host}:{proxmox_port} for VM {vmid}")
            logger.info(f"Node: {node_name}, VNC Port: {port}")
            logger.info(f"Ticket (first 30 chars): {ticket_decoded[:30]}...")
            
            # Authenticate with Proxmox to get session cookie
            # The VNC WebSocket requires both the vncticket AND a valid auth cookie
            import httpx
            logger.info("Authenticating with Proxmox...")
            
            try:
                async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
                    auth_response = await client.post(
                        f"https://{proxmox_host}:{proxmox_port}/api2/json/access/ticket",
                        data={
                            "username": node.username,
                            "password": node.password
                        }
                    )
                    
                    if auth_response.status_code != 200:
                        logger.error(f"Proxmox auth failed: {auth_response.status_code}")
                        raise Exception(f"Proxmox authentication failed: {auth_response.status_code}")
                    
                    auth_data = auth_response.json()
                    if 'data' not in auth_data:
                        logger.error(f"Unexpected auth response: {auth_data}")
                        raise Exception("Invalid authentication response from Proxmox")
                    
                    auth_cookie = auth_data['data']['ticket']
                    logger.info("Successfully authenticated with Proxmox")
                    
            except Exception as e:
                logger.error(f"Failed to authenticate with Proxmox: {e}")
                raise
            
            # Use websockets library for the WebSocket connection
            import websockets
            import ssl
            
            # Create SSL context that doesn't verify certificates (for self-signed certs)
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            logger.info("Connecting to Proxmox VNC WebSocket...")
            
            # Connect to Proxmox VNC WebSocket with both ticket in URL and auth cookie in header
            async with websockets.connect(
                proxmox_ws_url,
                ssl=ssl_context,
                additional_headers={
                    "Cookie": f"PVEAuthCookie={auth_cookie}"
                }
            ) as proxmox_ws:
                logger.info("Connected to Proxmox VNC WebSocket")
                
                # Create bidirectional proxy
                async def forward_to_proxmox():
                    """Forward messages from frontend to Proxmox"""
                    try:
                        while True:
                            data = await websocket.receive_bytes()
                            await proxmox_ws.send(data)
                    except WebSocketDisconnect:
                        logger.info("Frontend WebSocket disconnected")
                    except Exception as e:
                        logger.error(f"Error forwarding to Proxmox: {e}")
                
                async def forward_to_frontend():
                    """Forward messages from Proxmox to frontend"""
                    try:
                        async for message in proxmox_ws:
                            if isinstance(message, bytes):
                                await websocket.send_bytes(message)
                            else:
                                await websocket.send_text(message)
                    except Exception as e:
                        logger.error(f"Error forwarding to frontend: {e}")
                
                # Run both forwarding tasks concurrently
                await asyncio.gather(
                    forward_to_proxmox(),
                    forward_to_frontend(),
                    return_exceptions=True
                )
            
            break  # Exit the async for loop
            
    except Exception as e:
        logger.error(f"VNC proxy error: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason=f"Proxy error: {str(e)}")
        except:
            pass
    finally:
        logger.info("VNC proxy connection closed")
