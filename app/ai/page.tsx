'use client';

import { ChatCard } from '@/components/ChatCard';
import ChatForm from '@/components/ChatForm';
import { SOCKET_EVENTS } from '@/lib/const';
import { socket } from '@/lib/socketClient';
import { TChatShorting } from '@/lib/type';
import { useRouter } from 'next/router';
import { useState } from 'react';
import toast from 'react-hot-toast';

type TCreateChatPayload = {
  status: 'success' | 'error';
  message: string;
  chat?: TChatShorting;
};

export default function AiWorkflow() {
  const [chats, setChats] = useState<TChatShorting[]>([]);
  const router = useRouter();
  const addChat = (data: TChatShorting) => {
    setChats((r) => [data, ...r]);
  };

  const handleCreateNewRoom = async (question: string) => {
    const result = (await socket.emitWithAck(SOCKET_EVENTS.CREATE_NEW_CHAT, {
      question,
    })) as TCreateChatPayload;

    if (result) {
      if (result.status === 'success' && result.chat) {
        addChat(result.chat);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    }
  };

  return (
    <div className='flex mt-24 justify-center w-full'>
      <div className='flex flex-col gap-4 w-[500px]'>
        <h3>AI workflow</h3>
        <ChatForm onSendMessage={handleCreateNewRoom} />
        <div className='flex flex-col gap-5'>
          {chats.map((chat) => (
            <ChatCard
              chat={chat}
              key={`client-chat-${chat.id}`}
              onNameClick={() => router.push(`/?chat=${chat.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
