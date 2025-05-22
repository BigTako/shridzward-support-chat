import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

export type FromType = 'agent' | 'client' | 'context' | 'system';

type TMessage = {
  from: FromType;
  text: string;
};

type TRoom = {
  roomId: number;
  messages: TMessage[];
  createdAt: Date;
};

let agentSocketId: string;

const agentCredentials = {
  username: 'John',
  password: '12345',
};

const rooms: { [key: TRoom['roomId']]: TRoom } = {};

function sendMessage(roomId: TRoom['roomId'], message: TMessage) {
  const room = rooms[roomId];
  if (room) {
    room.messages = [...room.messages, message];
  }
}

app.prepare().then(() => {
  const httpServer = createServer(handle);
  const io = new Server(httpServer);

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ai events
    socket.on(
      'create-new-room',
      ({ question }: { question: string }, callback) => {
        const roomId = new Date().getTime();
        rooms[roomId] = {
          roomId,
          messages: [
            {
              from: 'context',
              text: `User question: "${question}". Please wait unitl client joins.`,
            },
          ],
          createdAt: new Date(),
        };
        const newChat = {
          roomId,
          from: 'context',
          lastMessage: `User question: "${question}". Please wait unitl client joins.`,
        };
        console.log({ agentSocketId });
        if (agentSocketId)
          socket.to(agentSocketId).emit('new-client-chat', newChat);
        callback({
          status: 'success',
          message: 'Room created successfuly',
          room: newChat,
        });
      }
    );
    //client events

    // agent events
    socket.on(
      'agent-login',
      (
        { username, password }: { username: string; password: string },
        callback
      ) => {
        const credsCorrect =
          username === agentCredentials.username &&
          password === agentCredentials.password;

        agentSocketId = socket.id;

        console.log({ credsCorrect });
        if (credsCorrect) {
          callback({
            status: 'success',
            message: 'Login successful!',
          });
        } else {
          callback({
            status: 'error',
            message: 'Invalid username or password',
          });
        }
      }
    );

    socket.on('get-chats', ({}, callback) => {
      const chats = Object.values(rooms).map((r) => {
        const lastMessage = r.messages[r.messages.length - 1];

        return {
          roomId: r.roomId,
          from: lastMessage.from,
          lastMessage: lastMessage.text,
        };
      });
      callback(chats);
    });

    socket.on('join-room', ({ roomId, user: { username, type } }, callback) => {
      socket.join(roomId);
      socket.to(roomId).emit('user_joined', `${username} joined room `);
      console.log(`${username} joined room ${roomId}`);
      const isAgent = type === 'agent';
      if (!rooms[roomId]) {
        rooms[roomId] = {
          roomId,
          messages: [],
          createdAt: new Date(),
        };
        socket.to(roomId).emit('user_joined', `${username} joined room `);
      }
      const room = rooms[roomId];
      callback(
        isAgent
          ? room.messages
          : room.messages.filter((m) => m.from !== 'context')
      );
    });

    socket.on(
      'message',
      ({
        roomId,
        message,
        sender,
      }: {
        roomId: TRoom['roomId'];
        message: string;
        sender: { username: string; type: 'client' | 'agent' };
      }) => {
        console.log(`Message from ${sender} in room ${roomId}: ${message}`);
        socket
          .to(String(roomId))
          .emit('message', { from: sender.type, text: message });
        sendMessage(roomId, { from: sender.type, text: message });
      }
    );

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`Server running on http://${hostname}:${port}`);
  });
});
