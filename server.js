const net = require('net')
const {EventEmitter} = require('events')

const sockets = {};
const pairs = {};
const pending = [];

const CREATE_SESSION = 0x3C
const CREATE_SESSION_RESPONSE = 0x3D
const CONN_REQUEST = 0x3E
const CONN_RESPONSE = 0x3F
const INIT_HOLEPUNCH = 0x40
const INIT_CONN = 0x41
const ACK = 0x6
const NAK = 0x15
const ETX = 3

server = net.createServer((socket) => {


    const s = new Socket(socket)

    s.on("ready", (session) => {

        console.log(session)
        sockets[session.uid] = s

        index = pending.indexOf(s)
        pending.splice(index,1)

        msg = Buffer.from([CREATE_SESSION_RESPONSE, ACK, ETX])
        s.send(msg)
    });

    s.on("request", (peer) => {
        console.log("Received request for: ", peer, s.localPort)
        const peerSocket = sockets[peer]
        const buf = Buffer.from(peer)

        let start;
        if(!peerSocket) {    
            start = Buffer.from([CONN_RESPONSE, NAK])
        } else {
            start = Buffer.from([CONN_RESPONSE, ACK])
        }
        const body = Buffer.concat([Buffer.from([buf.length]), buf, Buffer.from([ETX])])
        const msg = Buffer.concat([start,body])

        s.send(msg)

        if(peerSocket) {
            const msg = createInitHolePunchPacket(s.remoteAddress,s.localPort)
            pairs[peerSocket.uID] = s.uID
            peerSocket.send(msg)
        }

    });

    s.on("closed", ()=> {
        delete sockets[s.uID];
        const peer = pairs[s.uID];
        
        const msg = createInitConnPacket(s.remoteAddress, s.localPort)
        sockets[peer] && sockets[peer].send(msg)
        sockets[peer] && sockets[peer].close();
    })

    pending.push(s)
})

server.listen(8080, ()=> {
    console.log("server listening")
})

function createInitConnPacket(remoteAddress,localPort) {
    let remoteFamily = remoteAddress.indexOf(":") > -1 ? "IPv6" : "IPv4";
    const start = Buffer.from([INIT_CONN])
    const ipBytes = []

    if(remoteFamily == "IPv6") {
        if(remoteAddress.indexOf("::ffff:") == 0) { //subnet prefix for ipv4
            const split = remoteAddress.split(":")
            remoteAddress = split[split.length-1]
            remoteFamily = "IPv4"
        } else {
            const split = remoteAddress.split(":")
            for(let i = 0; i < split.length; i++) {
                const lower = split[i].substring(0,2)
                const higher = split[i].substring(2)
                ipBytes.push(parseInt(lower,16))
                ipBytes.push(parseInt(higher,16))
            }
        }
    }

    if(remoteFamily == "IPv4") {
        remoteAddress.split(".").forEach(byte => ipBytes.push(parseInt(byte)))
    }

    const arr = new Uint16Array(1)
    arr[0] = parseInt(localPort)
    const port = Buffer.from(arr.buffer).swap16() //make sure the write the port in network byte order

    const familyFlag = remoteFamily == "IPv6" ? Buffer.from([1]) : Buffer.from([0])
    const ip = Buffer.from(ipBytes)
    const end = Buffer.from([ETX])

    const packet = Buffer.concat([start,familyFlag,ip,port,end])

    return packet;
}

function createInitHolePunchPacket(remoteAddress,localPort) {
    let remoteFamily = remoteAddress.indexOf(":") > -1 ? "IPv6" : "IPv4";
    const start = Buffer.from([INIT_HOLEPUNCH])
    const ipBytes = []

    if(remoteFamily == "IPv6") {
        if(remoteAddress.indexOf("::ffff:") == 0) { //subnet prefix for ipv4
            const split = remoteAddress.split(":")
            remoteAddress = split[split.length-1]
            remoteFamily = "IPv4"
        } else {
            const split = remoteAddress.split(":")
            for(let i = 0; i < split.length; i++) {
                const lower = split[i].substring(0,2)
                const higher = split[i].substring(2)
                ipBytes.push(parseInt(lower,16))
                ipBytes.push(parseInt(higher,16))
            }
        }
    }

    if(remoteFamily == "IPv4") {
        remoteAddress.split(".").forEach(byte => ipBytes.push(parseInt(byte)))
    }

    const arr = new Uint16Array(1)
    arr[0] = parseInt(localPort)
    const port = Buffer.from(arr.buffer).swap16() //make sure the write the port in network byte order

    const familyFlag = remoteFamily == "IPv6" ? Buffer.from([1]) : Buffer.from([0])
    const ip = Buffer.from(ipBytes)
    const end = Buffer.from([ETX])

    const packet = Buffer.concat([start,familyFlag,ip,port,end])

    return packet;

}


class Socket extends EventEmitter {
    constructor(socket) {
        super()
        this._socket = socket
        this.uID = ""
        this.localPort = null
        this.localAddress = ""
        this.remoteAddress = ""
        this.remotePort = null

        this._socket.on("data", (data) => {
            const command = data[0]
           
            switch(command) {
                case CREATE_SESSION: this._createSession(data)
                    break;
                case CONN_REQUEST: this._handleConnRequest(data)
                    break;
            }
        });

        this._socket.on("close", ()=> {
            console.log(`Closing Socket ${this.uID}`)
            this.emit("closed")
        })
    }

    send(data) {
        this._socket.write(data)
    }

    close() {
        this._socket.destroy();
    }

    _createSession(sessionData) {

        const uidLength = sessionData[1]
        const uid = sessionData.slice(2,2+uidLength).toString()
        const startOfIP = 2+ uidLength + 1

        let ip = ""
        for(let i = startOfIP; i < startOfIP + 4; i++) {
            ip += sessionData[i].toString()
            
            if(i < startOfIP + 3) {
                ip += "."
            }
        }

        const startOfPort = startOfIP + 4 + 1

        const portBuf = Buffer.from(sessionData.slice(startOfPort,startOfPort+2))
        const port = portBuf.readUInt16BE(0)

        const session = {
            uid: uid,
            localIp:ip,
            localPort:port,
            remoteAddress: this._socket.remoteAddress,
            remotePort: this._socket.remotePort,
            remoteFamily: this._socket.remoteFamily
        }

        this.uID = session.uid,
        this.localAddress = session.localIp,
        this.localPort = session.localPort
        this.remoteAddress = session.remoteAddress
        this.remotePort = session.remotePort
        this.remoteFamily = session.remoteFamily
        

        this.emit("ready", session)
    }

    _handleConnRequest(data) {
        const peerLength = data[1]
        const peer = data.slice(2,peerLength+2)

        this.emit("request", peer.toString())
    }
}

