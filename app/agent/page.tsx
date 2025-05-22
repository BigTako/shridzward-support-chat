'use client';

import { ChatCard } from '@/components/ChatCard';
import ChatForm from '@/components/ChatForm';
import ChatMessage from '@/components/ChatMessage';
import { socket } from '@/lib/socketClient';
import { TMessage, TRoom } from '@/lib/type';
import { useUser } from '@/lib/useUser';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AgentPage() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get('room');

  const [rooms, setRooms] = useState<TRoom[]>([]);

  const [messages, setMessages] = useState<TMessage[]>([]);

  const router = useRouter();
  const { user, isLoggedIn } = useUser();

  useEffect(() => {
    if (window) {
      if (isLoggedIn === false || (user && user.type !== 'agent')) {
        router.push('/agent/login');
      }
    }
  }, [router, user, isLoggedIn]);

  useEffect(() => {
    async function getChats() {
      const chats = (await socket.emitWithAck('get-chats')) as TRoom[];
      setRooms(chats);
    }
    getChats();
  }, []);

  useEffect(() => {
    socket.on('new-client-chat', (data: TRoom) => {
      console.log(' received chat from socket');
      setRooms((prev) => [data, ...prev]);
    });

    socket.on('message', (data) => {
      console.log(' received message from socket');
      setMessages((prev) => [...prev, data]);
    });

    socket.on('user_joined', (message) => {
      setMessages((prev) => [...prev, { from: 'system', text: message }]);
    });

    return () => {
      socket.off('new-client-chat');
      socket.off('message');
      socket.off('user_joined');
    };
  }, []);

  useEffect(() => {
    async function getChatHistory() {
      const messages = await socket.emitWithAck('join-room', { roomId, user });
      console.log({ messages });
      setMessages((prev) => [
        ...prev.filter((m) => m.from === 'system'),
        ...messages,
      ]);
    }

    if (user && roomId) {
      console.log('get chat history');
      getChatHistory();
    }
  }, [roomId, user]);

  const handleSendMessage = (message: string) => {
    if (user && roomId) {
      socket.emit('message', { roomId, message, sender: user });
      setMessages((prev) => [...prev, { from: user?.type, text: message }]);
    }
  };

  if (!user) return null;

  return (
    <div className='flex mt-24 justify-center w-full'>
      <div className='flex gap-3'>
        <div className='flex flex-col gap-4 w-[500px] mt-10 text-center p-2'>
          {rooms && rooms.length > 0 ? (
            rooms.map((chat, i) => (
              <ChatCard
                key={`client-chat-${i}`}
                chatLinkType='agent'
                chat={chat}
              />
            ))
          ) : (
            <div className='flex h-full w-full justify-center items-center'>
              <h3>No chats created yet</h3>
            </div>
          )}
        </div>
        {roomId ? (
          <div className='flex justify-center w-full'>
            <div className='w-full mx-auto'>
              <h1 className='mb-4 text-2xl font-bold'>Room: 1</h1>
              <div className='h-[500px] overflow-y-auto p-4 mb-4 bg-gray-200 border2 rounded-lg'>
                {messages.map((msg, index) => (
                  <ChatMessage
                    key={index}
                    sender={msg.from}
                    message={msg.text}
                    isOwnMessage={user.type === msg.from}
                  />
                ))}
              </div>
              <ChatForm onSendMessage={handleSendMessage} />
            </div>
          </div>
        ) : (
          <div className='flex justify-center items-center w-full h-full'>
            <h3 className='h-fit'>Room is not selected yet</h3>
          </div>
        )}
      </div>
    </div>
  );
}
