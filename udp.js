const dgram = require('dgram')


const socket = dgram.createSocket("udp4")
const CREATE_SESSION = 0x3C
const CREATE_SESSION_RESPONSE = 0x3D
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

    switch (opType) {
        case CREATE_SESSION:
            const ok = storeConnection(msg,rinfo)
            const response = ok ? createSessionResponsePacket(ACK) : createSessionResponsePacket(NAK);
            socket.send(response, rinfo.port, rinfo.address)
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

socket.bind(41234)