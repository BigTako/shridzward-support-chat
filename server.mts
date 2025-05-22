import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

type TMessageType = 'user' | 'system' | 'context';

type TUserType = 'client' | 'agent';

type TUser = {
  username: string;
  socketId: string;
  type: TUserType;
};

type TMessage = {
  from: TUser;
  type: TMessageType;
  text: string;
};

type TChat = {
  id: string;
  createdAt: Date;
  messages: TMessage[];
};

// interface IUserStore {
//   users: TUser[];
//   getUsers: () => TUser[];
//   getUser: (user: TUser) => TUser | undefined;
//   addUser: (user: TUser) => IUserStore;
//   removeUser: (user: TUser) => IUserStore;
// }

// interface IChatsStore {
//   chats: TChat[];
//   getChats: () => TChat[];
//   getChat: (chatId: TChat['id']) => TChat | undefined;
//   getOrCreateChat: (chatId: TChat['id']) => TChat;
//   createChat: (data: TChat) => IChatsStore;
//   removeChat: (chatId: TChat['id']) => IChatsStore;
//   sendMessage: (chatId: TChat['id'], message: TMessage) => IChatsStore;
// }

type TChatShorting = Pick<TChat, 'id' | 'createdAt'> & {
  lastMessage: TMessage;
};

type TUserInfo = Pick<TUser, 'username' | 'type'>;

class UserStore {
  users: TUser[] = [];

  getUsers(): TUser[] {
    return this.users;
  }

  getUser({ username, type }: TUserInfo): TUser | undefined {
    return this.users.find((u) => u.username === username && u.type === type);
  }

  addUser(user: TUser): this {
    // replace any existing same‐username user, then append
    this.users = [
      ...this.users.filter((u) => u.username !== user.username),
      user,
    ];
    return this;
  }

  removeUser({ username, type }: TUser): this {
    // keep only those that don't match both username+type
    this.users = this.users.filter(
      (u) => !(u.username === username && u.type === type)
    );
    return this;
  }
}

class ChatsStore {
  chats: TChat[] = [];

  getChats(): TChat[] {
    return this.chats;
  }

  getChat(chatId: string): TChat | undefined {
    return this.chats.find((c) => c.id === chatId);
  }

  getOrCreateChat(chatId: string): TChat {
    let chat = this.getChat(chatId);
    if (!chat) {
      chat = { id: chatId, createdAt: new Date(), messages: [] };
      this.chats.push(chat);
    }
    return chat;
  }

  createChat(data: TChat): this {
    this.chats.push(data);
    return this;
  }

  removeChat(chatId: string): this {
    this.chats = this.chats.filter((c) => c.id !== chatId);
    return this;
  }

  sendMessage(chatId: string, message: TMessage): this {
    const chat = this.getChat(chatId);
    if (chat) {
      chat.messages = [...chat.messages, message];
    }
    return this;
  }
}

// let agentSocketId: string;

const agentCredentials = {
  username: 'John',
  password: '12345',
};

// const rooms: { [key: TRoom['roomId']]: TRoom } = {};

// function sendMessage(roomId: TRoom['roomId'], message: TMessage) {
//   const room = rooms[roomId];
//   if (room) {
//     room.messages = [...room.messages, message];
//   }
// }

app.prepare().then(() => {
  const httpServer = createServer(handle);
  const io = new Server(httpServer);

  const chatStore = new ChatsStore();
  const userStore = new UserStore();

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ai events
    socket.on(
      'create-new-chat',
      ({ question }: { question: string }, callback) => {
        try {
          console.log('creating new chat');
          const chatId = String(new Date().getTime());
          const contextMessage = {
            from: {
              username: 'Claude',
              socketId: '0',
              type: 'client',
            },
            type: 'context',
            text: `User asked a question: ${question}. Please wait unitl client joins.`,
          } as TMessage;

          const newChatShorting = {
            id: chatId,
            createdAt: new Date(),
            lastMessage: contextMessage,
          } as TChatShorting;

          chatStore.createChat({
            id: chatId,
            createdAt: newChatShorting.createdAt,
            messages: [contextMessage],
          });

          const agent = userStore.getUsers().find((u) => u.type === 'agent');
          console.log({ agent });
          if (agent) {
            socket.to(agent.socketId).emit('new-client-chat', newChatShorting);
          }

          callback({
            status: 'success',
            message: 'Chat created successfuly',
            chat: newChatShorting,
          });
        } catch (e) {
          console.log({ e });
          callback({
            status: 'error',
            message: 'Error creating chat.Please review server logs.',
          });
        }
      }
    );

    socket.on(
      'login',
      (
        { username, type, password }: TUserInfo & { password?: string },
        callback
      ) => {
        try {
          console.log('login');
          const isAgent = type === 'agent';
          if (isAgent) {
            const agent = userStore.getUser({ username, type });
            if (agent) {
              return callback({
                status: 'error',
                message: 'Agent is already logged in',
              });
            }
            const credsCorrect =
              username === agentCredentials.username &&
              password === agentCredentials.password;
            if (!credsCorrect) {
              return callback({
                status: 'error',
                message: 'Invalid credentials',
              });
            }
          }
          userStore.addUser({
            username,
            type,
            socketId: socket.id,
          });

          // const user = userStore.getUsers();
          // console.log({ user });

          return callback({
            status: 'success',
            message: 'Login successful!',
          });
        } catch (e) {
          console.log({ e });
          callback({
            status: 'error',
            message: 'Error creating chat.Please review server logs.',
          });
        }
      }
    );
    //client events

    // agent events
    // socket.on(
    //   'agent-login',
    //   (
    //     { username, password }: { username: string; password: string },
    //     callback
    //   ) => {
    //     const credsCorrect =
    //       username === agentCredentials.username &&
    //       password === agentCredentials.password;

    //     agentSocketId = socket.id;

    //     console.log({ credsCorrect });
    //     if (credsCorrect) {
    //       callback({
    //         status: 'success',
    //         message: 'Login successful!',
    //       });
    //     } else {
    //       callback({
    //         status: 'error',
    //         message: 'Invalid username or password',
    //       });
    //     }
    //   }
    // );

    // socket.on('get-chats', ({}, callback) => {
    //   const chats = Object.values(rooms).map((r) => {
    //     const lastMessage = r.messages[r.messages.length - 1];

    //     return {
    //       roomId: r.roomId,
    //       from: lastMessage.from,
    //       lastMessage: lastMessage.text,
    //     };
    //   });
    //   callback(chats);
    // });

    // socket.on('join-room', ({ roomId, user: { username, type } }, callback) => {
    //   socket.join(roomId);
    //   socket.to(roomId).emit('user_joined', `${username} joined room `);
    //   console.log(`${username} joined room ${roomId}`);
    //   const isAgent = type === 'agent';
    //   if (!rooms[roomId]) {
    //     rooms[roomId] = {
    //       roomId,
    //       messages: [],
    //       createdAt: new Date(),
    //     };
    //     socket.to(roomId).emit('user_joined', `${username} joined room `);
    //   }
    //   const room = rooms[roomId];
    //   callback(
    //     isAgent
    //       ? room.messages
    //       : room.messages.filter((m) => m.from !== 'context')
    //   );
    // });

    // socket.on(
    //   'message',
    //   ({
    //     roomId,
    //     message,
    //     sender,
    //   }: {
    //     roomId: TRoom['roomId'];
    //     message: string;
    //     sender: { username: string; type: 'client' | 'agent' };
    //   }) => {
    //     console.log(`Message from ${sender} in room ${roomId}: ${message}`);
    //     socket
    //       .to(String(roomId))
    //       .emit('message', { from: sender.type, text: message });
    //     sendMessage(roomId, { from: sender.type, text: message });
    //   }
    // );

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`Server running on http://${hostname}:${port}`);
  });
});
