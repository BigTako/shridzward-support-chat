'use client';

import ChatForm from '@/components/ChatRoom';
import { socket } from '@/lib/socketClient';
import Image from 'next/image';
import { useState } from 'react';

type FromType = 'agent' | 'client' | 'context';

const fromMapping: Record<FromType, string> = {
  agent: 'Agent John',
  client: 'Client',
  context: 'Context',
};

// const chats: { roomId: string; from: FromType; lastMessage: string }[] = [
//   {
//     roomId: '123ig123g1g',
//     from: 'context',
//     lastMessage: 'User question: question. Please wait unitl client joins.',
//   },
// ];

type TRoom = {
  roomId: number;
  from: FromType;
  lastMessage: string;
};

export default function AiWorkflow() {
  const [rooms, setRooms] = useState<TRoom[]>([]);

  const addRoom = (data: TRoom) => {
    setRooms((r) => [data, ...r]);
  };
  const handleCreateNewRoom = async (question: string) => {
    const result = (await socket.emitWithAck('create-new-room', {
      question,
    })) as {
      status: 'success' | 'error';
      message: string;
      room: {
        roomId: number;
        from: FromType;
        lastMessage: string;
      };
    };

    if (result && result.status === 'success') {
      addRoom(result.room);
    }
  };
  return (
    <div className='flex mt-24 justify-center w-full'>
      <div className='flex flex-col gap-4 w-[500px]'>
        <h3>AI workflow</h3>
        <ChatForm onSendMessage={handleCreateNewRoom} />
        <div className='flex flex-col gap-5'>
          {rooms.map((chat, i) => (
            <div
              className='flex flex-col gap-3 justify-center p-2 border-[1px] border-black rounded-lg'
              key={`message-${i}`}
            >
              <div className='flex gap-2'>
                <Image
                  className='h-[50px] w-[50px] rounded-full'
                  src='https://www.assuropoil.fr/wp-content/uploads/2023/07/avoir-un-chat-sante.jpg'
                  alt='Client image'
                  width={540}
                  height={840}
                />
                <div className='flex-1 flex flex-col gap-1 max-w-full truncate'>
                  <h3 className='font-bold'>Room: {chat.roomId}</h3>
                  <h3 className='truncate text-ellipsis max-w-full'>
                    {fromMapping[chat.from]}: {chat.lastMessage}
                  </h3>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
