type TMessageType = 'user' | 'system' | 'agent-only' | 'client-only';

type TUserType = 'client' | 'agent';

type TUser = {
  username: string;
  socketId: string;
  type: TUserType;
};

type TUserInfo = Pick<TUser, 'username' | 'type'>;

type TMessage = {
  from: TUser;
  type: TMessageType;
  text: string;
};

type TChat = {
  id: string;
  createdAt: Date;
  members: TUser[];
  messages: TMessage[];
};

export type TChatShorting = Pick<TChat, 'id' | 'createdAt'> & {
  lastMessage: TMessage;
};

type TSupportChat = {
  id: string;
  members: TSupportUser['id'][];
  userQuestion: string;
  context?: string;
  createdAt: Date;
};

type TSupportChatPopulated = Omit<TSupportChat, 'members'> & {
  members: TSupportUser[];
  messages: TSupportMessagePopulated[];
};

export type TSupportChatPopulated = Omit<TSupportChat, 'members'> & {
  members?: TSupportUser;
  messages?: TSupportMessage[];
};

export type TSupportUser = {
  id: string;
  username: string;
  socketId: string;
  type: TUserType;
  createdAt: Date;
};

export type TSupportMessage = {
  id: string;
  chatId: TSupportChat['id'];
  senderId: TSupportUser['id'];
  type: TMessageType;
  text: string;
  createdAt: Date;
};

export type TSupportMessagePopulated = TSupportMessage & {
  sender?: TSupportUser;
  chat?: TSupportChat;
};

export type TSupportChatShorting = Pick<TSupportChat, 'id' | 'createdAt'> & {
  lastMessage: TSupportMessagePopulated;
};

export type AuthResponcePayload = {
  status: 'success' | 'error';
  message: string;
  _meta?: {
    user: TSupportUser;
  };
};
