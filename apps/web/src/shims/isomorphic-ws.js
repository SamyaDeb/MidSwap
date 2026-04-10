// Shim for isomorphic-ws that adds named WebSocket export for webpack compatibility
// isomorphic-ws browser.js only has `export default WebSocket` but packages import { WebSocket }
const WS = typeof WebSocket !== 'undefined' ? WebSocket : null;
export default WS;
export { WS as WebSocket };
