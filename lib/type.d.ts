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
