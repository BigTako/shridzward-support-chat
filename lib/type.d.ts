export type FromType = 'agent' | 'client' | 'context' | 'system';

export type TRoom = {
  roomId: number;
  from: FromType;
  lastMessage: string;
};

export type TMessage = {
  from: FromType;
  text: string;
};
