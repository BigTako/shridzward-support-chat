export interface EnvVars {
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_CLIENT_PRIVATE_KEY: string;
  SPREADSHEET_ID: string;
  HOSTNAME: string;
  PORT: string;
  AGENT_LOGIN: string;
  AGENT_PASSWORD: string;
}

type TMessageType = 'user' | 'system' | 'agent-only' | 'client-only';

type TUserType = 'client' | 'agent';

type TUserInfo = Pick<TUser, 'username' | 'type'>;

type TChat = {
  id: string;
  members: TUser['id'][];
  userQuestion: string;
  context?: string;
  createdAt: Date;
};

type TChatPopulated = Omit<TChat, 'members'> & {
  members: TUser[];
  messages: TMessagePopulated[];
};

export type TUser = {
  id: string;
  username: string;
  socketId: string;
  type: TUserType;
  createdAt: Date;
};

export type TMessage = {
  id: string;
  chatId: TChat['id'];
  senderId: TUser['id'];
  type: TMessageType;
  text: string;
  createdAt: Date;
};

export type TMessagePopulated = TMessage & {
  sender?: TUser;
  chat?: TChat;
};

export type TChatShorting = Pick<TChat, 'id' | 'createdAt'> & {
  lastMessage: TMessagePopulated;
};

export type AuthResponcePayload = {
  status: 'success' | 'error';
  message: string;
  _meta?: {
    user: TUser;
  };
};
