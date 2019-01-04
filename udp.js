const dgram = require('dgram')


const socket = dgram.createSocket("udp4")

socket.on("listening", () => {
    console.log("Udp bound to port 41234")

});

socket.on("message", (msg,rinfo)=> {
    console.log("received message")
    console.log(rinfo.address)
})

socket.bind(41234)