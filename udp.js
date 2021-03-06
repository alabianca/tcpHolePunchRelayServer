const dgram = require('dgram')


const socket = dgram.createSocket("udp4")
const CREATE_SESSION = 0x3C
const CREATE_SESSION_RESPONSE = 0x3D
const CONN_REQ = 0x3E
const CONN_REQ_RESPONSE = 0x3F
const CONN_FORWARD_REQ = 0x40
const ACK = 6
const NAK = 21

const connections = {
    "test": {
        ip : "127.0.0.1",
        port : "4000",
        family : "IPv4"
    }
}

socket.on("listening", () => {
    console.log("Udp bound to port 41234")

});

socket.on("message", (msg,rinfo)=> {
    console.log("received message")
    console.log(rinfo.address, rinfo.port)
    handleMessage(socket,msg,rinfo)
});

function handleMessage(socket,msg,rinfo) {
    const opType = msg[0]
    let response;
    switch (opType) {
        case CREATE_SESSION:
            const ok = storeConnection(msg,rinfo)
            response = ok ? createSessionResponsePacket(ACK) : createSessionResponsePacket(NAK);
            socket.send(response, rinfo.port, rinfo.address)
            break;
        
        case CONN_REQ:
            const connData = parseConnectionRequestPacket(msg);
            response = connData ? createConnectionResponsePacket(ACK, connData.conn) : createConnectionResponsePacket(NAK,connData.conn);
            socket.send(response,rinfo.port,rinfo.address);
            //forward the connection request
            if(connData && connections[connData.sender] && connData.conn) {
                const otherClientConnection = connections[connData.sender];
                const forwardRequestResponse = createforwardConnectionRequestPacket(otherClientConnection);

                socket.send(forwardRequestResponse, connData.conn.port, connData.conn.ip);
            }

            break;
        
    }
}

function storeConnection(msg,rinfo) {
    const user = msg.slice(1).toString()

    if(connections[user]) {
        return false
    }

    connections[user] = {
        ip : rinfo.address,
        port : rinfo.port,
        family : rinfo.family
    }

    return true
}

function createSessionResponsePacket(AckNak) {
    const buf = Buffer.from([CREATE_SESSION_RESPONSE, AckNak])
    return buf
}

function parseConnectionRequestPacket(packet) {
    const userLength = packet[1];
    const user = packet.slice(2,userLength+2).toString();
    const senderLength = packet[2+userLength];
    const sender = packet.slice(userLength+3).toString()

    console.log(`Connection Request for: ${user} from: ${sender} `)

    if(!connections[user]) {
        return null
    }

    return {
        conn:connections[user],
        sender: sender
    }
}

function createConnectionResponsePacket(AckNak,connection) {
    const start = Buffer.from([CONN_REQ_RESPONSE,AckNak])
    console.log("Creating connection response Packet for: ", connection)
    if(!connection) {
        return start
    }
    //encode the port
    const larr = new Uint16Array(1)
    larr[0] = parseInt(connection.port)
    const port = Buffer.from(larr.buffer).swap16()
    //encode the ip
    const ipBytes = connection.family == "IPv4" ? encodeIpv4(connection.ip) : encodeIpv6(connection.ip);

    const ip = Buffer.from(ipBytes)
    
    return Buffer.concat([start,ip,port])
}

function createforwardConnectionRequestPacket(connection) {
    const start = Buffer.from([CONN_FORWARD_REQ])
    //encode the port
    const larr = new Uint16Array(1)
    larr[0] = parseInt(connection.port)
    const port = Buffer.from(larr.buffer).swap16()
    //encode the ip
    const ipBytes = connection.family == "IPv4" ? encodeIpv4(connection.ip) : encodeIpv6(connection.ip);

    const ip = Buffer.from(ipBytes)

    return Buffer.concat([start,ip,port])
}

function encodeIpv4(ipv4) {
   return ipv4.split(".").map(byte => parseInt(byte))
}

function encodeIpv6(ipv6) {
    const ipBytes = []
    const split = ipv6.split(":")
    for(let i = 0; i < split.length; i++) {
        const lower = split[i].substring(0,2)
        const higher = split[i].substring(2)
        ipBytes.push(parseInt(lower,16))
        ipBytes.push(parseInt(higher,16))
    }

    return ipBytes
}

socket.bind(41234)