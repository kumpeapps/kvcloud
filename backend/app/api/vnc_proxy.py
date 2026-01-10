"""
VNC WebSocket Proxy
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.database import async_session_maker
from app.models import ProxmoxNode
from sqlalchemy import select
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/vnc", tags=["vnc"])  # Served via /api proxy pathRewrite

@router.get("/test")
async def test_endpoint():
    """Test endpoint to verify router is working"""
    return {"status": "VNC router is working"}

@router.websocket("/proxy/{node_id}/{vmid}")
async def vnc_proxy_websocket(websocket: WebSocket, node_id: int, vmid: int):
    logger.error(f"[VNC] ===== WEBSOCKET ENDPOINT HIT ===== node={node_id}, vm={vmid}")
    
    # Get query parameters
    query_params = dict(websocket.query_params)
    vncticket_from_fe = query_params.get('ticket', '')
    port_from_fe = query_params.get('port', '')
    
    logger.error(f"[VNC] Frontend sent ticket: {vncticket_from_fe[:50]}...")
    logger.error(f"[VNC] Frontend sent port: {port_from_fe}")
    
    try:
        await websocket.accept()
        logger.error(f"[VNC] ===== WEBSOCKET ACCEPTED ===== node={node_id}, vm={vmid}")
    except Exception as e:
        logger.error(f"[VNC] Failed to accept: {e}")
        return
    
    try:
        logger.error(f"[VNC] About to get database session...")
        async with async_session_maker() as db:
            logger.error(f"[VNC] Database session opened, querying node {node_id}...")
            result = await db.execute(select(ProxmoxNode).filter(ProxmoxNode.id == node_id))
            node = result.scalar_one_or_none()
            
            logger.error(f"[VNC] ===== LOADED NODE ===== id={node.id if node else 'None'} name={node.name if node else 'None'}")
            if not node:
                logger.error(f"[VNC] Node not found: {node_id}")
                await websocket.close(code=1008, reason="Node not found")
                return
            
            # Authenticate and get fresh ticket (must be same session)
            logger.error(f"[VNC] Authenticating and getting fresh VNC ticket...")
            try:
                import httpx
                async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
                    # Step 1: Authenticate
                    auth_resp = await client.post(
                        f"https://{node.host}:{node.port}/api2/json/access/ticket",
                        data={"username": node.username, "password": node.password}
                    )
                    if auth_resp.status_code != 200:
                        logger.error(f"[VNC] Auth failed: {auth_resp.status_code}")
                        await websocket.close(code=1008, reason="Auth failed")
                        return
                    
                    auth_data = auth_resp.json()['data']
                    auth_cookie = auth_data['ticket']
                    csrf = auth_data.get('CSRFPreventionToken', '')
                    logger.error(f"[VNC] ✓ Authenticated")
                    
                    # Step 2: Get VNC ticket using same session
                    vnc_resp = await client.post(
                        f"https://{node.host}:{node.port}/api2/json/nodes/{node.name}/qemu/{vmid}/vncproxy",
                        headers={"Cookie": f"PVEAuthCookie={auth_cookie}", "CSRFPreventionToken": csrf}
                    )
                    if vnc_resp.status_code != 200:
                        logger.error(f"[VNC] VNC ticket failed: {vnc_resp.status_code}")
                        await websocket.close(code=1008, reason="VNC ticket failed")
                        return
                    
                    vnc_data = vnc_resp.json()['data']
                    vnc_port = vnc_data['port']
                    vnc_ticket = vnc_data['ticket']
                    logger.error(f"[VNC] ✓ Got VNC ticket, port: {vnc_port}")
            except Exception as e:
                logger.error(f"[VNC] Auth exception: {e}")
                await websocket.close(code=1008, reason=f"Auth error: {e}")
                return
            
            logger.error(f"[VNC] Connecting with ticket: {vnc_ticket[:50]}... port: {vnc_port}")
            
            try:
                import websockets, ssl, urllib.parse
                
                # Connect to Proxmox VNC WebSocket  
                # URL-encode the ticket to handle special characters properly
                encoded_ticket = urllib.parse.quote(vnc_ticket, safe='')
                ws_url = f"wss://{node.host}:{node.port}/api2/json/nodes/{node.name}/qemu/{vmid}/vncwebsocket?port={vnc_port}&vncticket={encoded_ticket}"
                logger.error(f"[VNC] WS URL: {ws_url[:120]}...")
                logger.error(f"[VNC] Using Cookie: PVEAuthCookie={auth_cookie[:50]}...")
                
                ssl_ctx = ssl.create_default_context()
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = ssl.CERT_NONE
                
                # Include Cookie header with auth session
                logger.error(f"[VNC] Attempting WebSocket connection...")
                logger.error(f"[VNC] Headers: Cookie=PVEAuthCookie={auth_cookie[:30]}...")
                
                async with websockets.connect(
                    ws_url, 
                    ssl=ssl_ctx,
                    additional_headers={
                        "Cookie": f"PVEAuthCookie={auth_cookie}"
                    }
                ) as pws:
                    logger.error("[VNC] ✓✓✓ SUCCESSFULLY CONNECTED TO PROXMOX VNC ✓✓✓")
                    
                    # Bidirectional proxy
                    async def fwd_to_px():
                        try:
                            while True:
                                data = await websocket.receive_bytes()
                                await pws.send(data)
                        except Exception as e:
                            logger.debug(f"[VNC] fwd_to_px ended: {e}")
                    
                    async def fwd_to_fe():
                        try:
                            async for msg in pws:
                                if isinstance(msg, bytes):
                                    await websocket.send_bytes(msg)
                                else:
                                    await websocket.send_bytes(msg.encode())
                        except Exception as e:
                            logger.debug(f"[VNC] fwd_to_fe ended: {e}")
                    
                    import asyncio
                    await asyncio.gather(fwd_to_px(), fwd_to_fe())
                    
            except Exception as ws_e:
                logger.error(f"[VNC] WebSocket error: {type(ws_e).__name__}: {ws_e}")
                raise
                    
    except Exception as e:
        logger.error(f"[VNC] Error: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason=str(e)[:100])
        except: pass
