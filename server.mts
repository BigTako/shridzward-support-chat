import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import {
  EnvVars,
  TChat,
  TChatPopulated,
  TChatShorting,
  TMessage,
  TMessagePopulated,
  TUser,
  TUserInfo,
} from './lib/type';
import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';
import { stringSimilarity } from 'string-similarity-js';
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

class ChatStore {
  private static tabName = 'Chats';
  private static dataRange = 'A:E';
  constructor(private sheetRepo: GoogleSheetsRepository) {}

  async getChats(filter?: {
    id?: { in?: string[] };
    members?: { includes: string };
  }): Promise<TChat[]> {
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

    const range = `${ChatStore.tabName}!${ChatStore.dataRange}`;

    // Read rows from spreadsheet
    const rows = await sheetApi.spreadsheets.values.get({
      auth,
      spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      range,
    });

    rows.data.values?.shift();

    let chats = rowsToObjects(rows.data.values || []) as TChat[];

    if (filter?.id?.in) {
      chats = chats.filter((c) => filter.id?.in?.includes(c.id));
    }

    if (filter?.members?.includes) {
      const memberId = filter.members.includes;
      chats = chats.filter((c) => c.members.includes(memberId));
    }

    return chats;
  }

  async getChat(chatId: TChat['id']) {
    const chats = await this.getChats();
    return chats.find((c) => c.id === chatId);
  }

  async createChat(
    data: Omit<TChat, 'id' | 'createdAt'>
  ): Promise<TChat | null> {
    try {
      function objToRow(obj: Omit<TChat, 'createdAt'> & { createdAt: string }) {
        const { id, members, userQuestion, context, createdAt } = obj;
        return [id, JSON.stringify(members), userQuestion, context, createdAt];
      }
      const { sheetApi } = await this.sheetRepo.getSpreadSheetApi();

      const body = {
        id: String(new Date().getTime()),
        ...data,
        createdAt: getFormattedTimestamp(),
      };

      const range = `${ChatStore.tabName}!${ChatStore.dataRange}`;

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

class MessageStore {
  private static tabName = 'Messages';
  private static dataRange = 'A:F';

  constructor(private sheetRepo: GoogleSheetsRepository) {}

  async getMessages(filter?: {
    id?: { in?: TMessage['id'][] } | TMessage['id'];
    chatId?:
      | {
          in?: TMessage['chatId'][];
        }
      | TChat['id'];
  }): Promise<TMessage[]> {
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
    const range = `${MessageStore.tabName}!${MessageStore.dataRange}`;
    // Read rows from spreadsheet
    const rows = await sheetApi.spreadsheets.values.get({
      auth,
      spreadsheetId: getEnvVar('SPREADSHEET_ID'),
      range,
    });
    rows.data.values?.shift(); // remove header
    let messages = toObjects(rows.data.values || []) as TMessage[];

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
      if (filter.chatId) {
        if (typeof filter.chatId === 'object' && 'in' in filter.chatId) {
          const inIds = filter?.chatId?.in as unknown as string[];
          if (filter.chatId.in) {
            messages = messages.filter((m) => inIds.includes(m.chatId));
          }
        } else {
          messages = messages.filter((m) => m.chatId === filter.chatId);
        }
      }
    }
    return messages;
  }

  async createMessage(
    data: Omit<TMessage, 'id' | 'createdAt'>
  ): Promise<TMessage | null> {
    try {
      function objToRow(
        obj: Omit<TMessage, 'createdAt'> & { createdAt: string }
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

      const range = `${MessageStore.tabName}!${MessageStore.dataRange}`;

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

  async removeMessage(messageId: TMessage['id']): Promise<boolean> {
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
        (s) => s.properties?.title === MessageStore.tabName
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

class UserStore {
  constructor(private sheetRepo: GoogleSheetsRepository) {}

  async getUsers(filter?: { id?: { in?: string[] } }): Promise<TUser[]> {
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

    let users = toObjects(rows.data.values || []) as TUser[];

    if (filter?.id?.in) {
      users = users.filter((u) => filter.id?.in?.includes(u.id));
    }

    return users;
  }

  async getUser(userId: TUser['id']) {
    const users = await this.getUsers();
    return users.find((u) => u.id === userId);
  }

  async getUserByUsernameAndType(data: Pick<TUser, 'username' | 'type'>) {
    const users = await this.getUsers();
    const user = users.find((u) => this.eq({ user1: u, user2: data }));
    return user;
  }

  async getUserBySocketId(socketId: TUser['socketId']) {
    const users = await this.getUsers();
    const user = users.find((user) => user.socketId === socketId);
    return user;
  }

  eq({
    user1,
    user2,
  }: {
    user1: Pick<TUser, 'username' | 'type'>;
    user2: Pick<TUser, 'username' | 'type'>;
  }) {
    return user1.type === user2.type && user1.username === user2.username;
  }

  async getOrCreate(data: Omit<TUser, 'id' | 'createdAt'>) {
    const user = await this.getUserByUsernameAndType(data);
    return user ? user : await this.createUser(data);
  }

  async createUser(
    data: Omit<TUser, 'id' | 'createdAt'>
  ): Promise<TUser | null> {
    function objToRow(obj: Omit<TUser, 'createdAt'> & { createdAt: string }) {
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

  async removeUser(userId: TUser['id']): Promise<boolean> {
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

  async removeUserBySocketId(socketId: TUser['socketId']): Promise<boolean> {
    try {
      // Get all chats to find the row index
      const user = await this.getUserBySocketId(socketId);
      if (!user) return false;
      return await this.removeUser(user.id);
    } catch (error) {
      console.log({ error });
      return false;
    }
  }

  async updateUser(
    userId: TUser['id'],
    data: Partial<Omit<TUser, 'id' | 'createdAt'>>
  ): Promise<TUser | null> {
    try {
      // First get the user to see if it exists and get current data
      const users = await this.getUsers();
      const userIndex = users.findIndex((user) => user.id === userId);

      if (userIndex === -1) {
        return null; // User not found
      }

      // The actual row in the spreadsheet (accounting for header row)
      const rowIndex = userIndex + 2;

      // Merge current user data with update data
      const currentUser = users[userIndex];
      const updatedUser = {
        ...currentUser,
        ...data,
      };

      const { sheetApi } = await this.sheetRepo.getSpreadSheetApi();
      const sheetName = 'Users';

      // Update the specific row in the sheet
      await sheetApi.spreadsheets.values.update({
        spreadsheetId: getEnvVar('SPREADSHEET_ID'),
        range: `${sheetName}!A${rowIndex}:E${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            [
              updatedUser.id,
              updatedUser.username,
              updatedUser.type,
              updatedUser.socketId,
              getFormattedTimestamp(),
            ],
          ],
        },
      });

      return updatedUser;
    } catch (error) {
      console.log({ error });
      return null;
    }
  }
}

class JoinService {
  constructor(
    private chatStore: ChatStore,
    private userStore: UserStore,
    private messageStore: MessageStore
  ) {}

  async populateMessages({
    messages,
    fields,
  }: {
    messages: TMessage[];
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
      const body = { ...message } as TMessagePopulated;
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

  async populateChats({
    chats,
    fields,
  }: {
    chats: TChat[];
    fields: ('members' | 'messages')[];
  }) {
    const populatedChats = [];
    // let members;
    let messages: TMessage[] = [];
    if (fields.includes('messages')) {
      const chatsIds = chats.map((chat) => chat.id);
      messages = await this.messageStore.getMessages({
        chatId: { in: chatsIds },
      });
    }

    const popualatedMessages = await this.populateMessages({
      messages,
      fields: ['sender'],
    });

    for (const chat of chats) {
      const body = { ...chat } as Omit<TChatPopulated, 'members'>;
      if (fields.includes('messages')) {
        const chatMessages = popualatedMessages?.filter(
          (m) => m.chatId === chat.id
        );
        if (chat) {
          body['messages'] = chatMessages;
        }
      }
      populatedChats.push(body);
    }

    return populatedChats;
  }

  async getChatShortings() {
    const chats = await this.chatStore.getChats();
    const chatIds = chats.map((c) => c.id);
    const messages = await this.messageStore.getMessages({
      chatId: { in: chatIds },
    });

    // console.log({ messages: JSON.stringify(messages, undefined, 4) });

    const lastMessages = chats.map((chat) => {
      const chatMessages = messages.filter(
        (m) => m.chatId === chat.id && m.type !== 'client-only'
      );
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
        userQuestion: chat.userQuestion,
        lastMessage,
      };
    });
  }
  async getChatMessagesPopulated(chatId: TChat['id']) {
    const messages = await this.messageStore.getMessages({ chatId });
    return await this.populateMessages({ messages, fields: ['sender'] });
  }

  async sendMessage(body: Omit<TMessage, 'id' | 'createdAt'>) {
    const message = await this.messageStore.createMessage(body);
    if (message) {
      const [populatedMessage] = await this.populateMessages({
        messages: [message],
        fields: ['sender'],
      });
      return populatedMessage;
    }
    return null;
  }
}

export function getEnvVar(key: keyof EnvVars) {
  const env = process.env as unknown as EnvVars;
  return env[key]?.replace(/\\n/g, '\n');
}

export function getFormattedTimestamp() {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

app.prepare().then(async () => {
  const httpServer = createServer(handle);
  const io = new Server(httpServer);

  const sheetsRepo = new GoogleSheetsRepository();
  const sheetChatStore = new ChatStore(sheetsRepo);
  const sheetUserStore = new UserStore(sheetsRepo);
  const sheetMessageStore = new MessageStore(sheetsRepo);
  const sheetJoinService = new JoinService(
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
      console.log('[SUCCESS] Claude is user is created successfuly');
      return data;
    });

  const agentUser = await sheetUserStore
    .getOrCreate({
      username: getEnvVar('AGENT_LOGIN'),
      socketId: '0',
      type: 'agent',
    })
    .then((data) => {
      console.log('[SUCCESS] Agent user is created successfuly');
      return data;
    });

  function agentIsLoggedIn() {
    return agentUser && agentUser.socketId !== '0';
  }

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ai events
    socket.on(
      'create-new-chat',
      async ({ question, username, context }: TCreateChatPayload, callback) => {
        console.log('creating new chat');
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

          const chatMembers = [client] as TUser[];
          if (agentIsLoggedIn()) {
            if (agentUser) chatMembers.push(agentUser);
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

          let contextMessages = [];

          if (context) {
            contextMessages.push({
              senderId: claudeUser.id,
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
              text: `Hey there, ${username}! Nice to meet you again\nNo worries, agent will join soon and answer jour question😉`,
            },
          ] as Omit<TMessage, 'id' | 'createdAt'>[];

          // create messages
          const messages = await Promise.all(
            contextMessages.map((message) =>
              sheetMessageStore.createMessage(message)
            )
          );

          const lastMessageAgentVisible = messages.findLast(
            (m) => m?.type !== 'client-only'
          ) as TMessage;

          const [populatedLastMessage] =
            await sheetJoinService.populateMessages({
              messages: [lastMessageAgentVisible],
              fields: ['sender'],
            });

          const newChatShorting = {
            id: chat.id,
            createdAt: chat.createdAt,
            userQuestion: question,
            lastMessage: populatedLastMessage,
          } as TChatShorting;

          if (agentUser) {
            const agent = await sheetUserStore.getUser(agentUser.id);
            if (agent) {
              socket
                .to(agent.socketId)
                .emit('new-client-chat', newChatShorting);
            }
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

    socket.on(
      'refresh-user',
      async ({ userId }: { userId: TUser['id'] }, callback) => {
        try {
          console.log(`Refresing user: ${userId}`);
          const agent = await sheetUserStore.getUser(agentUser?.id || '');
          if (agent && userId === agent.id && agent.socketId !== '0') {
            callback({
              status: 'error',
              message: 'Agent is already logged in',
            });
          }

          const user = await sheetUserStore.updateUser(userId, {
            socketId: socket.id,
          });

          if (!user) {
            throw new Error('Such user is not found');
          }

          callback({
            status: 'success',
            message: 'User refreshed',
            _meta: {
              user: user,
            },
          });
        } catch (e) {
          console.log({ e });
          callback({
            status: 'error',
            message: 'Error refreshing user. Please review server logs.',
          });
        }
      }
    );

    socket.on(
      'get-client-data',
      async ({ chatId }: { chatId: TChat['id'] }, callback) => {
        try {
          const chat = await sheetChatStore.getChat(chatId);
          const userId = chat?.members.find(
            (memberId) => memberId !== agentUser?.id
          );
          if (chat && userId) {
            const user = await sheetUserStore.getUser(userId);
            callback?.(user);
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

          const currentAgent = (await sheetUserStore.getUser(
            agentUser?.id || ''
          )) as TUser;

          if (currentAgent && isAgent) {
            const alreadyLoggedIn = currentAgent.socketId !== '0';

            if (alreadyLoggedIn) {
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

          const newAgent = await sheetUserStore.updateUser(
            agentUser?.id || '',
            {
              socketId: socket.id,
            }
          );

          return callback({
            status: 'success',
            message: 'Login successful!',
            _meta: {
              user: newAgent,
            },
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
      async (
        { chatId, user }: { chatId: TChat['id']; user: TUser },
        callback
      ) => {
        const chat = await sheetChatStore.getChat(chatId);

        if (chat) {
          socket.join(chatId);

          const message = {
            id: String(new Date().getTime()),
            chatId,
            senderId: 'system',
            sender: {
              id: 'system',
              username: 'System',
              socketId: '1',
              type: 'client',
              createdAt: new Date(),
            },
            text: `${user.type === 'agent' ? 'Support Agent ' : ''}${
              user.username
            } joined the chat`,
            type: 'system',
            createdAt: new Date(),
          } as TMessagePopulated;

          socket.to(chatId).emit('user_joined', message);
          console.log(`${user.username} joined room ${chatId}`);

          const isAgent = user.type === 'agent';

          const chatMessages = await sheetJoinService.getChatMessagesPopulated(
            chat.id
          );

          const chatInfo = {
            ...chat,
            messages: isAgent
              ? chatMessages.filter((m) => m.type !== 'client-only')
              : chatMessages.filter((m) => m.type !== 'agent-only'),
          } as TChat;

          callback?.(chatInfo);
        }
      }
    );

    socket.on(
      'message',
      async (
        body: {
          chatId: TChat['id'];
          type: TMessage['type'];
          text: string;
          senderId: TMessage['senderId'];
        },
        callback
      ) => {
        console.log(
          `Message from ${body.senderId} in room ${body.chatId}: ${body.text}`
        );
        const message = await sheetJoinService.sendMessage(body);
        socket.to(body.chatId).emit('message', message);
        callback?.(message);
        // chatStore.sendMessage(chatId, message);
      }
    );

    // search-withing-support-archieve
    socket.on(
      'logout',
      async ({ userId }: { userId: TUser['id'] }, callback) => {
        console.log(`Logout user`);
        try {
          const user = await sheetUserStore.getUser(userId);

          if (!user) throw new Error('User not found');

          const chats = await sheetChatStore.getChats({
            members: { includes: userId },
          });

          chats.forEach((room) => {
            socket.to(room.id).emit('user_left', `${user?.username} left`);
            socket.leave(room.id);
          });

          let isRemovalSuccessful: boolean;

          if (user?.type === 'agent') {
            isRemovalSuccessful = Boolean(
              await sheetUserStore.updateUser(userId, { socketId: '0' })
            );
          } else {
            isRemovalSuccessful = Boolean(
              await sheetUserStore.removeUser(userId)
            );
          }

          if (!isRemovalSuccessful)
            throw new Error('User to remove is not found');

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
      'get-answers-by-question',
      async ({ question }: { question: string }, callback) => {
        // get chats with such question
        console.log('get-answers-by-question');
        const chats = await sheetChatStore.getChats();
        const relevantChatsIds = chats
          .map((chat) => {
            const relevancy = stringSimilarity(chat.userQuestion, question);
            return {
              id: chat.id,
              relevancy,
            };
          })
          .sort((a, b) => b.relevancy - a.relevancy)
          .slice(0, 3)
          .map((chat) => chat.id);

        const relevantChats = chats.filter((chat) =>
          relevantChatsIds.includes(chat.id)
        );

        const populatedRelevantChats = await sheetJoinService.populateChats({
          chats: relevantChats,
          fields: ['messages'],
        });

        let textStr = 'Chat ID|User Question|Context|Created At|Messages\n';
        populatedRelevantChats.map((chat) => {
          const messagesText = chat.messages
            ?.filter((m) => m.type === 'user')
            .map((m) => `(${m.sender?.type},${m.text})`);
          const infoStr = `${chat.id}|${chat.userQuestion}|${chat.context}|${chat.createdAt}|From(user type),Text\n${messagesText}`;
          textStr += infoStr;
        });

        callback?.({
          status: 'success',
          message: 'Successfuly grabbed infromation related to user question',
          _meta: {
            text: textStr,
          },
        });
      }
    );

    socket.on('disconnect', async () => {
      console.log(`User is disconnected ${socket.id}`);
      const user = await sheetUserStore.getUserBySocketId(socket.id);
      if (user) {
        if (user.type === 'agent') {
          await sheetUserStore.updateUser(user.id, {
            socketId: '0',
          });
        } else {
          await sheetUserStore.updateUser(user.id, {
            socketId: '0',
          });
        }
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`Server running on http://${hostname}:${port}`);
  });
});
