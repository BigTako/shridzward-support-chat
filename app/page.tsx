'use client';
import ChatMessage from '@/components/ChatMessage';
import ChatForm from '@/components/ChatForm';
import { socket } from '@/lib/socketClient';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TMessage } from '@/lib/type';
import { FromType } from '@/server.mjs';

export default function Home() {
  const searchParams = useSearchParams();

  const roomId = searchParams.get('room');

  const [messages, setMessages] = useState<TMessage[]>([]);

  const user = useMemo(
    () => ({
      username: 'Client',
      type: 'client',
    }),
    []
  ) as { username: string; type: FromType };

  useEffect(() => {
    socket.on('user_joined', (message) => {
      setMessages((prev) => [...prev, { from: 'system', text: message }]);
    });

    socket.on('message', (data) => {
      console.log(' received message from socket');
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      socket.off('message');
      socket.off('user_joined');
    };
  }, []);

  useEffect(() => {
    if (user && roomId) {
      socket
        .emitWithAck('join-room', { roomId, user })
        .then((chatHistory: TMessage[]) => {
          setMessages(chatHistory);
        });
    }
  }, [user, roomId]);

  console.log({ roomId, user });

  const handleSendMessage = (message: string) => {
    if (user && roomId) {
      socket.emit('message', { roomId, message, sender: user });
      setMessages((prev) => [...prev, { from: user?.type, text: message }]);
    }
  };

  console.log({ messages });

  return (
    <div className='flex mt-24 justify-center w-full'>
      {roomId ? (
        <div className='w-full max-w-3xl mx-auto'>
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
      ) : (
        <div className='w-full max-w-3xl mx-auto flex justify-center items-center'>
          <h3>{"You're not connected to any room"}</h3>
        </div>
      )}
    </div>
  );
}
