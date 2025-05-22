export type TMessageType = 'user' | 'system' | 'context';

export type TUserType = 'client' | 'agent';

export type TUser = {
  username: string;
  // socketId: string;
  type: TUserType;
};

export type TMessage = {
  from: TUser;
  type: TMessageType;
  text: string;
};

export type TChat = {
  id: string;
  createdAt: Date;
  messages: TMessage[];
};

export type TChatShorting = Pick<TChat, 'id' | 'createdAt'> & {
  lastMessage: TMessage;
};
