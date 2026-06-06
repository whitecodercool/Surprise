import { FetchRequest, JsonRpcProvider } from 'ethers'

async function test() {
    const fetchReq = new FetchRequest('https://ethereum-rpc.publicnode.com')
    const provider = new JsonRpcProvider(fetchReq)
    for (const name of ['vitalik.eth', 'ethereum.eth', 'nick.eth', 'sismo.eth', 'nouns.eth', 'jesse.eth']) {
        try {
            const resolver = await provider.getResolver(name)
            if (resolver) {
                const content = await resolver.getContentHash()
                console.log(name, '->', content)
            } else {
                console.log(name, '-> no resolver')
            }
        } catch (e) {
            console.log(name, '-> error', e)
        }
    }
}
test()
