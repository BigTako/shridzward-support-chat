'use client';
import ChatMessage from '@/components/ChatMessage';
import ChatForm from '@/components/ChatRoom';
import { socket } from '@/lib/socketClient';
import { useEffect, useState } from 'react';

export default function Home() {
  const [joined, setJoined] = useState<boolean>(false);
  const [room, setRoom] = useState<string>('');
  const [messages, setMessages] = useState<
    { sender: string; message: string }[]
  >([]);
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    socket.on('message', (data) => {
      console.log(' received message from socket');
      setMessages((prev) => [...prev, data]);
    });

    socket.on('user_joined', (message) => {
      setMessages((prev) => [...prev, { sender: 'system', message }]);
    });

    return () => {
      socket.off('user_joined');
      socket.off('message');
    };
  }, []);

  const handleSendMessage = (message: string) => {
    setMessages((prev) => [...prev, { sender: userName, message }]);
    socket.emit('message', {
      room,
      message,
      sender: userName,
    });
  };

  const handleJoinRoom = async () => {
    if (userName && room) {
      socket.emitWithAck('join-room', {
        room,
        username: userName,
      });
    }
    setJoined(true);
  };

  console.log({ messages });

  return (
    <div className='flex mt-24 justify-center w-full'>
      {!joined ? (
        <div className='flex flex-col gap-2 items-center justify-center'>
          <h1>How should we call you?</h1>
          <input
            type='text'
            placeholder='Type text...'
            className='flex-1 px-4 border-2 py-2 rounded-lg focus:outline-none'
            onChange={(e) => setUserName(e.target.value)}
          />
          <h1>Room name</h1>
          <input
            type='text'
            placeholder='Type text...'
            className='flex-1 px-4 border-2 py-2 rounded-lg focus:outline-none'
            onChange={(e) => setRoom(e.target.value)}
          />
          <button
            type='button'
            className='px-4 py-2 rounded-lg text-white bg-blue-500'
            onClick={handleJoinRoom}
          >
            Join
          </button>
        </div>
      ) : (
        <div className='w-full max-w-3xl mx-auto'>
          <h1 className='mb-4 text-2xl font-bold'>Room: 1</h1>
          <div className='h-[500px] overflow-y-auto p-4 mb-4 bg-gray-200 border2 rounded-lg'>
            {messages.map((msg, index) => (
              <ChatMessage
                key={index}
                sender={msg.sender}
                message={msg.message}
                isOwnMessage={msg.sender === userName}
              />
            ))}
          </div>
          <ChatForm onSendMessage={handleSendMessage} />
        </div>
      )}
    </div>
  );
}
