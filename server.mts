import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

type TMessage = {
  type: 'context' | 'client' | 'agent';
  from: 'context' | 'client' | 'agent';
  text: string;
};

type TRoom = {
  roomId: number;
  messages: TMessage[];
  createdAt: Date;
};

const agentCredentials = {
  username: 'John',
  password: '12345',
};

const rooms: { [key: number]: TRoom } = {};

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
              type: 'context',
              from: 'context',
              text: `User question: "${question}". Please wait unitl client joins.`,
            },
          ],
          createdAt: new Date(),
        };
        callback({
          status: 'success',
          message: 'Room created successfuly',
          room: {
            roomId,
            from: 'context',
            lastMessage: `User question: "${question}". Please wait unitl client joins.`,
          },
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

    socket.on('join-room', ({ room, username }) => {
      socket.join(room);
      console.log(`User ${username} joined room ${room}`);
      socket.to(room).emit('user_joined', `${username} joined room `);
    });

    socket.on('message', ({ room, message, sender }) => {
      console.log(`Message from ${sender} in room ${room}: ${message}`);
      socket.to(room).emit('message', { sender, message });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`Server running on http://${hostname}:${port}`);
  });
});
