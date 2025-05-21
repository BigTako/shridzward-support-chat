export type FromType = 'agent' | 'client' | 'context';

export type TRoom = {
  roomId: number;
  from: FromType;
  lastMessage: string;
};
