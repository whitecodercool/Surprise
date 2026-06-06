const http = require('https');
const req = http.request('https://ethereum-rpc.publicnode.com', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity'
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log('STATUS:', res.statusCode, '\nBODY:', data));
});
req.write(JSON.stringify({
    "jsonrpc":"2.0",
    "id":1,
    "method":"eth_call",
    "params":[{"to":"0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e","data":"0x0178b8bfd321de6204043b8118029d5b780825319806b7ceea9e3f34e6a8d6e32630ce7e"},"latest"]
}));
req.end();
