import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import {
  TChat,
  TChatShorting,
  TMessage,
  TMessageType,
  TSupportChat,
  TSupportChatShorting,
  TSupportMessage,
  TSupportMessagePopulated,
  TSupportUser,
  TUser,
  TUserInfo,
  TUserType,
} from './lib/type';
import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

type TCreateChatPayload = {
  question: string;
  username: string;
  context?: string;
};

interface EnvVars {
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_CLIENT_PRIVATE_KEY: string;
  SPREADSHEET_ID: string;
  HOSTNAME: string;
  PORT: string;
  AGENT_LOGIN: string;
  AGENT_PASSWORD: string;
}

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

  // getOrCreateChat(chatId: string): TChat {
  //   let chat = this.getChat(chatId);
  //   if (!chat) {
  //     chat = { id: chatId, members: [], createdAt: new Date(), messages: [] };
  //     this.chats.push(chat);
  //   }
  //   return chat;
  // }

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

function getEnvVar(key: keyof EnvVars) {
  const env = process.env as unknown as EnvVars;
  return env[key]?.replace(/\\n/g, '\n');
}

function getFormattedTimestamp() {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

class GoogleSheetsRepository {
  constructor() {}

  async getSpreadSheetApi() {
    const auth = new google.auth.JWT(
      getEnvVar('GOOGLE_CLIENT_EMAIL'),
      undefined,
      getEnvVar('GOOGLE_CLIENT_PRIVATE_KEY'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheetApi = google.sheets({
      version: 'v4',
      auth,
    });

    return {
      sheetApi,
      auth,
    };
  }

  async getOrCreateTab({
    tabName,
    rowCount,
    headers,
    range,
  }: {
    tabName: string;
    rowCount?: number;
    headers: string[];
    range: string;
  }) {
    const { sheetApi } = await this.getSpreadSheetApi();
    const columnCount = headers?.length || 0;
    const meta = await sheetApi.spreadsheets.get({
      spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      includeGridData: false,
    });
    const sheets = meta.data.sheets || [];

    for (const s of sheets) {
      if (s.properties && s.properties.title === tabName)
        return s.properties.sheetId;
    }

    // 3. If the sheet doesn’t exist, create it (and add headers)
    const addSheetResp = await sheetApi.spreadsheets.batchUpdate({
      spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: tabName,
                gridProperties: { rowCount, columnCount },
              },
            },
          },
        ],
      },
    });

    if (columnCount) {
      await sheetApi.spreadsheets.values.update({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
        range: `${tabName}!${range}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers],
        },
      });
    }

    return addSheetResp.data.replies?.[0].addSheet?.properties?.sheetId;
  }
}

class SheetChatStore {
  private static tabName = 'Chats';
  private static dataRange = 'A:E';
  constructor(private sheetRepo: GoogleSheetsRepository) {}

  async getChats(filter?: { id?: { in?: string[] } }): Promise<TSupportChat[]> {
    function rowsToObjects(rows: string[][]) {
      return rows.map((row) => {
        const [id, members, userQuestion, context, createdAt] = row;
        return {
          id,
          members: JSON.parse(members),
          userQuestion,
          context,
          createdAt: new Date(createdAt),
        };
      });
    }

    const { sheetApi, auth } = await this.sheetRepo.getSpreadSheetApi();

    const range = `${SheetChatStore.tabName}!${SheetChatStore.dataRange}`;

    // Read rows from spreadsheet
    const rows = await sheetApi.spreadsheets.values.get({
      auth,
      spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      range,
    });

    rows.data.values?.shift();

    let chats = rowsToObjects(rows.data.values || []);

    if (filter?.id?.in) {
      chats = chats.filter((c) => filter.id?.in?.includes(c.id));
    }

    return chats;
  }

  async createChat(
    data: Omit<TSupportChat, 'id' | 'createdAt'>
  ): Promise<TSupportChat | null> {
    try {
      function objToRow(
        obj: Omit<TSupportChat, 'createdAt'> & { createdAt: string }
      ) {
        const { id, members, userQuestion, context, createdAt } = obj;
        return [id, JSON.stringify(members), userQuestion, context, createdAt];
      }
      const { sheetApi } = await this.sheetRepo.getSpreadSheetApi();

      const body = {
        id: String(new Date().getTime()),
        ...data,
        createdAt: getFormattedTimestamp(),
      };

      const range = `${SheetChatStore.tabName}!${SheetChatStore.dataRange}`;

      await sheetApi.spreadsheets.values.append({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [objToRow(body)],
        },
      });

      return {
        id: body.id,
        ...data,
        createdAt: new Date(body.createdAt),
      };
    } catch (error) {
      console.log({ error });
      return null;
    }
  }

  async removeChat(chatId: string): Promise<boolean> {
    try {
      // Get all chats to find the row index
      const chats = await this.getChats();
      const chatIndex = chats.findIndex((chat) => chat.id === chatId);

      if (chatIndex === -1) {
        return false; // Chat not found
      }

      // Row index in sheet is chatIndex + 2 (accounting for header row and 0-based index)
      const rowToDelete = chatIndex + 2;

      const { sheetApi } = await this.sheetRepo.getSpreadSheetApi();

      // Get the sheet ID
      const meta = await sheetApi.spreadsheets.get({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      });

      const sheets = meta.data.sheets || [];
      const chatSheet = sheets.find((s) => s.properties?.title === 'Chats');

      if (!chatSheet || !chatSheet.properties?.sheetId) {
        return false;
      }

      // Delete the row using batchUpdate
      await sheetApi.spreadsheets.batchUpdate({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: chatSheet.properties.sheetId,
                  dimension: 'ROWS',
                  startIndex: rowToDelete - 1, // 0-based index
                  endIndex: rowToDelete, // exclusive end index
                },
              },
            },
          ],
        },
      });

      return true;
    } catch (error) {
      console.log({ error });
      return false;
    }
  }
}

class SheetMessageStore {
  private static tabName = 'Messages';
  private static dataRange = 'A:F';

  constructor(private sheetRepo: GoogleSheetsRepository) {}

  async getMessages(filter?: {
    id?: { in?: TSupportMessage['id'][] } | TSupportMessage['id'];
    chatId?:
      | {
          in?: TSupportMessage['chatId'][];
        }
      | TSupportChat['id'];
  }): Promise<TSupportMessage[]> {
    function toObjects(rows: string[][]) {
      return rows.map((row) => {
        const [id, chatId, senderId, type, text, createdAt] = row;
        return {
          id,
          chatId,
          senderId,
          type,
          text,
          createdAt: new Date(createdAt),
        };
      });
    }

    const { sheetApi, auth } = await this.sheetRepo.getSpreadSheetApi();
    // const sheetName = 'Messages';
    const range = `${SheetMessageStore.tabName}!${SheetMessageStore.dataRange}`;
    // Read rows from spreadsheet
    const rows = await sheetApi.spreadsheets.values.get({
      auth,
      spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      range,
    });
    rows.data.values?.shift(); // remove header
    let messages = toObjects(rows.data.values || []) as TSupportMessage[];

    if (filter) {
      if (filter.id) {
        if (typeof filter.id === 'object' && 'in' in filter.id) {
          const inIds = filter?.id?.in as unknown as string[];
          if (filter.id.in) {
            messages = messages.filter((m) => inIds.includes(m.id));
          }
        } else {
          messages = messages.filter((m) => m.id === filter.id);
        }
      }
    }
    return messages;
  }

  async createMessage(
    data: Omit<TSupportMessage, 'id' | 'createdAt'>
  ): Promise<TSupportMessage | null> {
    try {
      function objToRow(
        obj: Omit<TSupportMessage, 'createdAt'> & { createdAt: string }
      ) {
        const { id, chatId, senderId, type, text, createdAt } = obj;
        return [id, chatId, senderId, type, text, createdAt];
      }
      const { sheetApi } = await this.sheetRepo.getSpreadSheetApi();
      const body = {
        id: String(new Date().getTime()),
        ...data,
        createdAt: getFormattedTimestamp(),
      };

      const range = `${SheetMessageStore.tabName}!${SheetMessageStore.dataRange}`;

      await sheetApi.spreadsheets.values.append({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [objToRow(body)],
        },
      });
      return {
        ...body,
        createdAt: new Date(body.createdAt),
      };
    } catch (error) {
      console.log({ error });
      return null;
    }
  }

  async removeMessage(messageId: TSupportMessage['id']): Promise<boolean> {
    try {
      // Get all chats to find the row index
      const messages = await this.getMessages();
      const chatIndex = messages.findIndex(
        (message) => message.id === messageId
      );
      if (chatIndex === -1) {
        return false; // Chat not found
      }
      // Row index in sheet is chatIndex + 2 (accounting for header row and 0-based index)
      const rowToDelete = chatIndex + 2;
      const { sheetApi } = await this.sheetRepo.getSpreadSheetApi();
      // Get the sheet ID
      const meta = await sheetApi.spreadsheets.get({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      });
      const sheets = meta.data.sheets || [];
      const sheet = sheets.find(
        (s) => s.properties?.title === SheetMessageStore.tabName
      );
      if (!sheet || !sheet.properties?.sheetId) {
        return false;
      }
      // Delete the row using batchUpdate
      await sheetApi.spreadsheets.batchUpdate({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: sheet.properties.sheetId,
                  dimension: 'ROWS',
                  startIndex: rowToDelete - 1, // 0-based index
                  endIndex: rowToDelete, // exclusive end index
                },
              },
            },
          ],
        },
      });
      return true;
    } catch (error) {
      console.log({ error });
      return false;
    }
  }
}

class SheetJoinService {
  constructor(
    private chatStore: SheetChatStore,
    private userStore: SheetUserStore,
    private messageStore: SheetMessageStore
  ) {}

  async populateMessages({
    messages,
    fields,
  }: {
    messages: TSupportMessage[];
    fields: ('chat' | 'sender')[];
  }) {
    const populatedMessages = [];
    let chats;
    let users;
    if (fields.includes('chat')) {
      const chatIds = messages.map((m) => m.chatId);
      chats = await this.chatStore.getChats({ id: { in: chatIds } });
    }
    if (fields.includes('sender')) {
      const senderIds = messages.map((m) => m.senderId);
      users = await this.userStore.getUsers({ id: { in: senderIds } });
    }
    // if chat is fields - get chatIds and chats by that ids, attach chat
    for (const message of messages) {
      const body = { ...message } as TSupportMessagePopulated;
      if (fields.includes('chat')) {
        const chat = chats?.find((c) => c.id === message.chatId);
        if (chat) {
          body['chat'] = chat;
        }
      }
      if (fields.includes('sender')) {
        const sender = users?.find((s) => s.id === message.senderId);
        if (sender) {
          body['sender'] = sender;
        }
      }
      populatedMessages.push(body);
    }

    return populatedMessages;
  }

  async getChatShortings() {
    const chats = await this.chatStore.getChats();
    const chatIds = chats.map((c) => c.id);
    const messages = await this.messageStore.getMessages({
      chatId: { in: chatIds },
    });

    const lastMessages = chats.map((chat) => {
      const chatMessages = messages.filter((m) => m.chatId === chat.id);
      return chatMessages[chatMessages.length - 1];
    });

    const populatedLastMessages = await this.populateMessages({
      messages: lastMessages,
      fields: ['sender'],
    });

    return chats.map((chat) => {
      const lastMessage = populatedLastMessages.find(
        (m) => m.chatId === chat.id
      );
      return {
        id: chat.id,
        createdAt: new Date(chat.createdAt),
        lastMessage,
      };
    });
  }

  // async populateChats({
  //   chats,
  //   fields,
  // }: {
  //   chats: TSupportChat[];
  //   fields: ('members' | 'messages')[];
  // }) {}
}

class SheetUserStore {
  constructor(private sheetRepo: GoogleSheetsRepository) {}

  async getUsers(filter?: { id?: { in?: string[] } }): Promise<TSupportUser[]> {
    function toObjects(rows: string[][]) {
      return rows.map((row) => {
        const [id, username, type, socketId, createdAt] = row;
        return {
          id,
          username,
          type,
          socketId,
          createdAt: new Date(createdAt),
        };
      });
    }

    const { sheetApi, auth } = await this.sheetRepo.getSpreadSheetApi();
    const sheetName = 'Users';
    const range = `${sheetName}!A:E`;

    // Read rows from spreadsheet
    const rows = await sheetApi.spreadsheets.values.get({
      auth,
      spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      range,
    });

    rows.data.values?.shift();

    let users = toObjects(rows.data.values || []) as TSupportUser[];

    if (filter?.id?.in) {
      users = users.filter((u) => filter.id?.in?.includes(u.id));
    }

    return users;
  }

  async getUser(userId: TSupportUser['id']) {
    const users = await this.getUsers();
    return users.find((u) => u.id === userId);
  }

  async getUserByUsernameAndType(
    data: Pick<TSupportUser, 'username' | 'type'>
  ) {
    const users = await this.getUsers();
    const user = users.find((u) => this.eq({ user1: u, user2: data }));
    return user;
  }

  eq({
    user1,
    user2,
  }: {
    user1: Pick<TSupportUser, 'username' | 'type'>;
    user2: Pick<TSupportUser, 'username' | 'type'>;
  }) {
    return user1.type === user2.type && user1.username === user2.username;
  }

  async getOrCreate(data: Omit<TSupportUser, 'id' | 'createdAt'>) {
    const user = await this.getUserByUsernameAndType(data);
    return user ? user : await this.createUser(data);
  }

  async createUser(
    data: Omit<TSupportUser, 'id' | 'createdAt'>
  ): Promise<TSupportUser | null> {
    function objToRow(
      obj: Omit<TSupportUser, 'createdAt'> & { createdAt: string }
    ) {
      const { id, username, type, socketId, createdAt } = obj;
      return [id, username, type, socketId, createdAt];
    }
    try {
      const { sheetApi } = await this.sheetRepo.getSpreadSheetApi();

      const body = {
        id: randomUUID(),
        ...data,
        createdAt: getFormattedTimestamp(),
      };

      const sheetName = 'Users';
      const range = `${sheetName}!A:E`;

      await sheetApi.spreadsheets.values.append({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [objToRow(body)],
        },
      });

      return {
        ...body,
        createdAt: new Date(body.createdAt),
      };
    } catch (error) {
      console.log({ error });
      return null;
    }
  }

  async removeUser(userId: TSupportUser['id']): Promise<boolean> {
    try {
      // Get all chats to find the row index
      const users = await this.getUsers();
      const chatIndex = users.findIndex((user) => user.id === userId);

      if (chatIndex === -1) {
        return false; // Chat not found
      }

      // Row index in sheet is chatIndex + 2 (accounting for header row and 0-based index)
      const rowToDelete = chatIndex + 2;

      const { sheetApi } = await this.sheetRepo.getSpreadSheetApi();

      // Get the sheet ID
      const meta = await sheetApi.spreadsheets.get({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      });

      const sheets = meta.data.sheets || [];
      const userSheet = sheets.find((s) => s.properties?.title === 'Users');

      if (!userSheet || !userSheet.properties?.sheetId) {
        return false;
      }

      // Delete the row using batchUpdate
      await sheetApi.spreadsheets.batchUpdate({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: userSheet.properties.sheetId,
                  dimension: 'ROWS',
                  startIndex: rowToDelete - 1, // 0-based index
                  endIndex: rowToDelete, // exclusive end index
                },
              },
            },
          ],
        },
      });

      return true;
    } catch (error) {
      console.log({ error });
      return false;
    }
  }
}

app.prepare().then(async () => {
  const httpServer = createServer(handle);
  const io = new Server(httpServer);

  const sheetsRepo = new GoogleSheetsRepository();
  const sheetChatStore = new SheetChatStore(sheetsRepo);
  const sheetUserStore = new SheetUserStore(sheetsRepo);
  const sheetMessageStore = new SheetMessageStore(sheetsRepo);
  const sheetJoinService = new SheetJoinService(
    sheetChatStore,
    sheetUserStore,
    sheetMessageStore
  );

  await Promise.all([
    sheetsRepo.getOrCreateTab({
      tabName: 'Chats',
      rowCount: 1000,
      headers: ['ID', 'Members', 'User Question', 'Context', 'Created At'],
      range: 'A1:E1',
    }),
    await sheetsRepo.getOrCreateTab({
      tabName: 'Users',
      rowCount: 1000,
      headers: ['ID', 'User Name', 'User Type', 'Socket ID', 'Created At'],
      range: 'A1:E1',
    }),
    await sheetsRepo.getOrCreateTab({
      tabName: 'Messages',
      rowCount: 1000,
      headers: [
        'ID',
        'Chat ID',
        'From(User ID)',
        'Message Type',
        'Text',
        'Created At',
      ],
      range: 'A1:F1',
    }),
  ]).then(() => console.log('[SUCCESS] Tables are created or setup'));

  const claudeUser = await sheetUserStore
    .getOrCreate({
      username: 'Claude',
      socketId: '0',
      type: 'client',
    })
    .then((data) => {
      console.log('[SUCCESS] ');
      return data;
    });

  const chatStore = new ChatsStore();
  const userStore = new UserStore();

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ai events
    socket.on(
      'create-new-chat',
      async ({ question, username, context }: TCreateChatPayload, callback) => {
        try {
          if (!claudeUser) throw new Error('Claude user is not setup');
          // create new user with username
          const client = await sheetUserStore.createUser({
            username,
            socketId: socket.id,
            type: 'client',
          });

          if (!client) {
            return callback({
              status: 'error',
              message: 'Failed to create new client',
            });
          }

          const chatMembers = [client] as TSupportUser[];
          const agent = await sheetUserStore.getUserByUsernameAndType({
            username: getEnvVar('AGENT_LOGIN'),
            type: 'agent',
          });

          if (agent) {
            chatMembers.push(agent);
          }

          // create chat (with members user and agent)
          const chat = await sheetChatStore.createChat({
            userQuestion: question,
            members: chatMembers.map((u) => u.id),
            context,
          });

          if (!chat) {
            return callback({
              status: 'error',
              message: 'Failed to create chat',
            });
          }

          // create messages (and attach them to chat via chat id)
          console.log('creating new chat');

          // const chatId = String(new Date().getTime());
          let contextMessages = [];

          if (context) {
            contextMessages.push({
              from: claudeUser.id,
              chatId: chat.id,
              type: 'agent-only',
              text: `Context: ${context}`,
            });
          }

          contextMessages = [
            ...contextMessages,
            {
              senderId: claudeUser.id,
              chatId: chat.id,
              type: 'agent-only',
              text: `${username} is asking: ${question}`,
            },
            {
              senderId: claudeUser.id,
              chatId: chat.id,
              type: 'client-only',
              text: `Hey there, ${username}! Nice to meet you again😃 No worries, agent will join soon and answer jour question!`,
            },
          ] as Omit<TSupportMessage, 'id' | 'createdAt'>[];

          // create messages
          const messages = await Promise.all(
            contextMessages.map((message) =>
              sheetMessageStore.createMessage(message)
            )
          );

          const lastMessageAgentVisible = messages.findLast(
            (m) => m?.type !== 'client-only'
          ) as TSupportMessage;

          const [populatedLastMessage] =
            await sheetJoinService.populateMessages({
              messages: [lastMessageAgentVisible],
              fields: ['sender'],
            });

          const newChatShorting = {
            id: chat.id,
            createdAt: chat.createdAt,
            lastMessage: populatedLastMessage,
          } as TSupportChatShorting;

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
            message: 'Error creating chat. Please review server logs.',
          });
        }
      }
    );

    socket.on('refresh-agent', async ({}, callback) => {
      try {
        const agent = await sheetUserStore.getUserByUsernameAndType({
          username: getEnvVar('AGENT_LOGIN'),
          type: 'agent',
        });
        if (agent) {
          await sheetUserStore.removeUser(agent.id);
          await sheetUserStore.createUser({ ...agent, socketId: socket.id });
        }
        // console.log('refresh-agent');
        // const agent = userStore.getUsers().find((u) => u.type === 'agent') || {
        //   username: process.env.AGENT_LOGIN,
        //   type: 'agent',
        // };
        // const agentCopy = JSON.parse(
        //   JSON.stringify({ ...agent, socketId: socket.id })
        // );

        // userStore.addUser(agentCopy); // upsert agent

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
      'get-client-data',
      ({ chatId }: { chatId: TChat['id'] }, callback) => {
        try {
          const chat = chatStore.getChat(chatId);
          if (chat) {
            const userData = chat.members.find((u) => u.type === 'client');
            callback?.(userData);
          }
        } catch (e) {
          console.log({ e });
          callback({
            status: 'error',
            message: 'Error refreshing agent.Please review server logs.',
          });
        }
      }
    );

    socket.on(
      'login',
      async (
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

          await sheetUserStore.createUser({
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

    socket.on('get-chats', async (_, callback) => {
      console.log('get-chats');
      const shortings = await sheetJoinService.getChatShortings();
      callback(shortings);
    });

    socket.on(
      'join-chat',
      ({ chatId, user }: { chatId: TChat['id']; user: TUser }, callback) => {
        const chat = chatStore.getChat(chatId);

        if (chat) {
          const isMember = chat.members.some(
            (u) => u.type === user.type && u.username === user.username
          );
          if (!isMember) {
            chat.members = [...chat.members, user];
          }
          socket.join(chatId);
          socket
            .to(chatId)
            .emit('user_joined', `${user.username} joined room `);
          console.log(`${user.username} joined room ${chatId}`);
          const isAgent = user.type === 'agent';

          const chatInfo = {
            ...chat,
            messages: isAgent
              ? chat.messages.filter((m) => m.type !== 'client-only')
              : chat.messages.filter((m) => m.type !== 'agent-only'),
          } as TChat;

          callback?.(chatInfo);
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
