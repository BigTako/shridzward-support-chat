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

type TCreateChatPayload = {
  question: string;
  username: string;
  context?: string;
};

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
      ...this.users.filter(
        (u) => u.username !== user.username && u.type !== user.type
      ),
      user,
    ];
    return this;
  }

  removeUser({ username, type }: TUserInfo): this {
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

  getShortings(): TChatShorting[] {
    return this.chats.map((chat) => {
      const lastMessage = chat.messages[chat.messages.length - 1];
      return {
        ...chat,
        messages: undefined,
        lastMessage,
      };
    });
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
      ({ question, username, context }: TCreateChatPayload, callback) => {
        try {
          console.log('creating new chat');
          const chatId = String(new Date().getTime());
          const contextMessages = [
            {
              from: {
                username: 'Claude',
                socketId: '0',
                type: 'client',
              },
              type: 'context',
              text: `User question context: ${context}`,
            },
            {
              from: {
                username: 'Claude',
                socketId: '0',
                type: 'client',
              },
              type: 'context',
              text: `User(${username}) question: ${question}`,
            },
            {
              from: {
                username: 'Claude',
                socketId: '0',
                type: 'client',
              },
              type: 'context',
              text: `Please wait unitl client joins.`,
            },
          ] as TMessage[];

          const lastMessage = contextMessages[contextMessages.length - 1];
          const newChatShorting = {
            id: chatId,
            createdAt: new Date(),
            lastMessage,
          } as TChatShorting;

          chatStore.createChat({
            id: chatId,
            createdAt: newChatShorting.createdAt,
            messages: contextMessages,
          });

          const agent = userStore.getUsers().find((u) => u.type === 'agent');
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

    socket.on('refresh-agent', ({}, callback) => {
      try {
        console.log('refresh-agent');
        const agent = userStore.getUsers().find((u) => u.type === 'agent') || {
          username: process.env.AGENT_LOGIN,
          type: 'agent',
        };
        const agentCopy = JSON.parse(
          JSON.stringify({ ...agent, socketId: socket.id })
        );

        userStore.addUser(agentCopy); // upsert agent

        callback({
          status: 'success',
          message: 'Agent refreshed',
        });
      } catch (e) {
        console.log({ e });
        callback({
          status: 'error',
          message: 'Error refreshing agent.Please review server logs.',
        });
      }
    });

    socket.on(
      'login',
      (
        { username, type, password }: TUserInfo & { password?: string },
        callback
      ) => {
        const agentCredentials = {
          username: process.env.AGENT_LOGIN,
          password: process.env.AGENT_PASSWORD,
        };

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

    socket.on('get-chats', (_, callback) => {
      console.log('get-chats');
      callback(chatStore.getShortings());
    });

    socket.on(
      'join-chat',
      ({ chatId, user }: { chatId: TChat['id']; user: TUser }, callback) => {
        const chat = chatStore.getChat(chatId);

        if (chat) {
          socket.join(chatId);
          socket
            .to(chatId)
            .emit('user_joined', `${user.username} joined room `);
          console.log(`${user.username} joined room ${chatId}`);
          const isAgent = user.type === 'agent';
          console.log({ isAgent });
          callback?.(
            isAgent
              ? chat.messages
              : chat.messages.filter((m) => m.type !== 'context')
          );
        }
      }
    );

    socket.on(
      'message',
      ({ chatId, message }: { chatId: TChat['id']; message: TMessage }) => {
        const { from, text } = message;
        console.log(`Message from ${from.username} in room ${chatId}: ${text}`);
        socket.to(chatId).emit('message', message);
        chatStore.sendMessage(chatId, message);
      }
    );

    socket.on('logout', ({ user }: { user: TUser }, callback) => {
      try {
        console.log(`Logout user`);
        userStore.removeUser(user);
        const socketRooms = chatStore
          .getChats()
          .filter((chat) =>
            chat.messages.some((m) => m.from.socketId === socket.id)
          );
        socketRooms.forEach((room) => {
          socket.to(room.id).emit('user_left', `${user.username} left`);
          socket.leave(room.id);
        });
        return callback({
          status: 'success',
          message: 'Logout successful!',
        });
      } catch (e) {
        console.log(e);
        return callback({
          status: 'success',
          message: 'Error during logout.Please review server logs.',
        });
      }
    });

    // admin
    socket.on('get-users', (_, callback) => {
      const users = userStore.getUsers();
      callback(users);
      // const { from, text } = message;
      // console.log(`Message from ${from.username} in room ${chatId}: ${text}`);
      // socket.to(chatId).emit('message', message);
      // chatStore.sendMessage(chatId, message);
    });

    socket.on(
      'delete-user',
      ({ user }: { user: Omit<TUser, 'socketId'> }, callback) => {
        try {
          console.log(`Logout user`);
          userStore.removeUser(user);
          const socketRooms = chatStore
            .getChats()
            .filter((chat) =>
              chat.messages.some((m) => m.from.socketId === socket.id)
            );
          socketRooms.forEach((room) => {
            socket.to(room.id).emit('user_left', `${user.username} left`);
            socket.leave(room.id);
          });
          userStore.removeUser(user);
          return callback({
            status: 'success',
            message: 'Logout successful!',
          });
        } catch (e) {
          console.log(e);
          return callback({
            status: 'success',
            message: 'Error during logout.Please review server logs.',
          });
        }
      }
    );

    socket.on(
      'delete-chat',
      ({ chatId }: { chatId: TChat['id'] }, callback) => {
        try {
          const chat = chatStore.getChat(chatId);
          const users = chat?.messages.reduce((acc, cur) => {
            const user = cur.from;
            const alreadyIn = acc.some(
              (u) => u.type === user.type && u.username === user.username
            );
            if (!alreadyIn) {
              acc.push(user);
            }
            return acc;
          }, [] as TUser[]);

          users?.forEach((user) => {
            socket.to(user.socketId).emit('leave-chat', { chatId });
          });

          chatStore.removeChat(chatId);
          return callback({
            status: 'success',
            message: 'Chat deleted successfuly',
          });
        } catch (e) {
          console.log(e);
          return callback({
            status: 'success',
            message: 'Error during logout.Please review server logs.',
          });
        }
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
