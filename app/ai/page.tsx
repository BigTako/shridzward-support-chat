'use client';

import { ChatCard } from '@/components/ChatCard';
import ChatForm from '@/components/ChatForm';
import { socket } from '@/lib/socketClient';
import { FromType, TRoom } from '@/lib/type';
import { useState } from 'react';

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
            <ChatCard key={`client-chat-${i}`} chat={chat} />
          ))}
        </div>
      </div>
    </div>
  );
}
