import { WorkerTunnel } from './src/ghoststack/core/network/WorkerTunnel'

async function test() {
  try {
    const socket = await WorkerTunnel.establishTunnel('stake.com', 443, 'https://lingering-butterfly-0459.goyalashish367.workers.dev')
    console.log('Tunnel established!')
    
    socket.write('GET / HTTP/1.1\r\nHost: stake.com\r\nConnection: close\r\n\r\n')
    
    socket.on('data', (data) => {
      console.log('Received:', data.toString().substring(0, 100))
    })
    
    socket.on('end', () => {
      console.log('Connection closed by server')
      process.exit(0)
    })
  } catch (err) {
    console.error('Test failed:', err)
    process.exit(1)
  }
}

test()
