// socket.js
const SocketIO = require("socket.io");
const axios = require("axios");

module.exports = (server, app, sessionMiddleware) => {
    const io = SocketIO(server, {path: "/socket.io"});

    // 라우터에서 io 객체를 쓸 수 있게 저장
    // req.app.get("io")로 접근 가능
    app.set("io", io);

    // io는 Socket.IO에 네임스페이스를 부여하는 메소드.
    // Socket.IO는 디폴트로 / 네임스페이스에 접속하지만 of를 통해 다른 네임스페이스 만들 수 있음
    // 같은 네임스페이스끼리만 데이터 전달
    const room = io.of("/room");
    const chat = io.of("/chat");

    // io.use 메서드에 미들웨어 장착. 모든 웹 소켓 연결 시마다 실행됨.
    io.use((socket, next) => {
        sessionMiddleware(socket.request, socket.request.res, next);
    })

    // 1) room 네임스페이스에 붙인 이벤트 리스너
    room.on("connection", (socket) => {
        console.log("room 네임스페이스에 접속");
        socket.on("disconnect", () => {
            console.log("room 네임스페이스 접속 해제");
        });
    });

    // 2) chat 네임스페이스에 붙인 이벤트 리스너
    // join, leave는 방에 들어가고 나가는 메서드
    chat.on("connection", (socket) => {
        console.log("chat 네임스페이스에 접속");

        const req = socket.request;
        const {headers: { referer }} = req;
        const roomId = referer
            .split("/")[referer.split("/").length - 1]
            .replace(/\?.+/, '');
        socket.join(roomId)

        // to메서드로 특정 방에 데이터를 보냄
        socket.to(roomId).emit("join", {
            user: "system",
            chat: `${req.session.color}님이 입장하셨습니다.`, // sessionMiddleware 덕분에 사용 가능
        });

        socket.on("disconnect", () => {
            console.log("chat 네임스페이스 접속 해제");
            socket.leave(roomId); // 연결이 끊기면 자동으로 방에서 나가지지만 확실히 나가기 위해 추가

            // socket.adapter.rooms[방 아이디]에는 참여 중인 소켓 정보가 들어있음
            // 참여자 수가 0이면 방을 제거하는 HTTP 요청
            const currentRoom = socket.adapter.rooms[roomId];
            const userCount = currentRoom ? currentRoom.count : 0;
            if (userCount === 0) {
                axios.delete("http://localhost:8005/room/${roomId}")
                .then(() => {
                    console.log("방 지우기 성공")
                })
                .catch((error) => {
                    console.error(error);
                })
            }
            else {
                socket.to(roomId).emit("exit", {
                    user: "system",
                    chat: `${req.session.color}님이 퇴장하셨습니다.`
                })
            }
        })
    })
}