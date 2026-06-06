import { FetchRequest, JsonRpcProvider } from 'ethers'

async function test() {
    const fetchReq = new FetchRequest('https://ethereum-rpc.publicnode.com')
    const provider = new JsonRpcProvider(fetchReq)
    try {
        console.log('Resolving vitalik.eth...')
        const resolver = await provider.getResolver('vitalik.eth')
        if (resolver) {
            const content = await resolver.getContentHash()
            console.log('Content hash:', content)
        } else {
            console.log('No resolver found')
        }
    } catch (err) {
        console.error('Error:', err)
    }
}
test()
