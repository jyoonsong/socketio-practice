const express = require("express");

const Room = require("../schemas/room")
const Chat = require("../schemas/chat")

const router = express.Router();

router.get("/", async (req, res, next) => {
    try {
        const rooms = await Room.find({});
        res.render("main", { rooms, title: "GIF 채팅방", error: req.flash("roomError") });
    }
    catch (error) {
        console.error(error);
        next(error)
    }
});

router.get("/room", (req, res) => {
    res.render("room", {title: "GIF 채팅방 생성"});
})

// POST /room라우터는 채팅방을 만드는 라우터
router.post("/room", async (req, res, next) => {
    try {
        const room = new Room({
            title: req.body.title,
            max: req.body.max,
            owner: req.session.color,
            password: req.body.password
        });
        const newRoom = await room.save();

        // app.set("io", io)로 저장했던 io 객체를 req.app.get("io")로 가져올 수 있음
        const io = req.app.get("io"); 

        // /room 네임스페이스에 연결한 모든 클라이언트에게 새로 생성된 채팅방 데이터를 보내는 메서드
        io.of("/room").emit("newRoom", newRoom);
        
        res.redirect(`/room/${newRoom._id}?password=${req.body.password}`);
    }
    catch (error) {
        console.error(error);
        next(error)
    }
});

// GET /room라우터는 채팅방을 렌더링하는 라우터
router.get('/room/:id', async (req, res, next) => {
    try {
      const room = await Room.findOne({ _id: req.params.id });
      const io = req.app.get('io');
      if (!room) { // id에 해당하는 방이 존재하는가?
        req.flash('roomError', '존재하지 않는 방입니다.');
        return res.redirect('/');
      }
      if (room.password && room.password !== req.query.password) { // 비밀방의 경우 비밀번호가 맞는지
        req.flash('roomError', '비밀번호가 틀렸습니다.');
        return res.redirect('/');
      }
      const { rooms } = io.of('/chat').adapter;
      if (rooms && rooms[req.params.id] && room.max <= rooms[req.params.id].length) { // 허용인원 초과인지
        req.flash('roomError', '허용 인원이 초과하였습니다.');
        return res.redirect('/');
      }
      const chats = await Chat.find({ room: room._id }).sort('createdAt');
      return res.render('chat', {
        room,
        title: room.title,
        chats,
        user: req.session.color,
      });
    } catch (error) {
      console.error(error);
      return next(error);
    }
  });
  
  // DELETE /room/:id는 채팅방을 삭제하는 라우터
  router.delete('/room/:id', async (req, res, next) => {
    try {
      // 채팅방과 채팅 내역 삭제
      await Room.remove({ _id: req.params.id });
      await Chat.remove({ room: req.params.id });
      res.send('ok');
      setTimeout(() => {
          // 2초 뒤에 웹 소켓으로 /room 네임스페이스에 방이 삭제되었음을 알린다.
        req.app.get('io').of('/room').emit('removeRoom', req.params.id);
      }, 2000);
    } catch (error) {
      console.error(error);
      next(error);
    }
  });
  
  router.post('/room/:id/chat', async (req, res, next) => {
    try {
      const chat = new Chat({
        room: req.params.id,
        user: req.session.color,
        chat: req.body.chat,
      });
      await chat.save();
      req.app.get('io').of('/chat').to(req.params.id).emit('chat', chat);
      res.send('ok');
    } catch (error) {
      console.error(error);
      next(error);
    }
  }); 



module.exports = router;