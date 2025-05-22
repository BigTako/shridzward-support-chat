'use client';

import { ChatCard } from '@/components/ChatCard';
import ChatForm from '@/components/ChatForm';
import ChatMessage from '@/components/ChatMessage';
import { socket } from '@/lib/socketClient';
import { TChat, TChatShorting, TMessage, TUser } from '@/lib/type';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

function AgentLoginForm({ onSuccess }: { onSuccess: (user: TUser) => void }) {
  const handleLogin = async (username: string, password: string) => {
    const result = (await socket.emitWithAck('login', {
      username,
      type: 'agent',
      password,
    })) as {
      status: 'success' | 'error';
      message: string;
    };

    if (result) {
      if (result.status === 'success') {
        onSuccess({
          username,
          type: 'agent',
        });
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    }
  };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className='flex flex-col gap-4 w-[500px] text-center'>
      <h2 className='text-[24px] font-bold'>Login</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          console.log('submit');
          await handleLogin(username, password);
        }}
        className='w-full flex flex-col gap-3'
      >
        <input
          type='text'
          placeholder='Enter username'
          className='flex-1 px-4 border-2 py-2 rounded-lg focus:outline-none'
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type='text'
          placeholder='Enter password'
          className='flex-1 px-4 border-2 py-2 rounded-lg focus:outline-none'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type='submit'
          className='px-4 py-2 rounded-lg text-white bg-blue-500'
        >
          Submit
        </button>
      </form>
    </div>
  );
}

export default function AgentPage() {
  const [chatId, setChatId] = useState<TChat['id'] | null>(null);

  const [chats, setChats] = useState<TChatShorting[]>([
    {
      id: '1234132',
      createdAt: new Date(),
      lastMessage: {
        from: {
          username: 'Claude',
          type: 'client',
        },
        type: 'context',
        text: `User asked a question: ${'queystion'}. Please wait unitl client joins.`,
      },
    },
  ]);

  const [user, setUser] = useState<TUser | null>(null);

  const [messages, setMessages] = useState<TMessage[]>([]);

  // useEffect(() => {
  //   async function getChats() {
  //     const chats = (await socket.emitWithAck('get-chats')) as TRoom[];
  //     setRooms(chats);
  //   }
  //   getChats();
  // }, []);

  useEffect(() => {
    socket.on('new-client-chat', (data: TChatShorting) => {
      console.log(' received chat from socket');
      setChats((prev) => [data, ...prev]);
    });

    socket.on('message', (data) => {
      console.log(' received message from socket');
      setMessages((prev) => [...prev, data]);
    });

    socket.on('user_joined', (message) => {
      setMessages((prev) => [
        ...prev,
        {
          from: { username: '', type: 'client' },
          type: 'system',
          text: message,
        },
      ]);
    });

    return () => {
      socket.off('new-client-chat');
      socket.off('message');
      socket.off('user_joined');
    };
  }, []);

  // useEffect(() => {
  //   if (isAuthenticated && chatId) {
  //     socket.emit('joi')
  //   }
  // }, [isAuthenticated, chatId])

  // useEffect(() => {
  //   async function getChatHistory() {
  //     const messages = await socket.emitWithAck('join-room', { chatId, user });
  //     console.log({ messages });
  //     setMessages((prev) => [
  //       ...prev.filter((m) => m.from === 'system'),
  //       ...messages,
  //     ]);
  //   }

  //   if (user && chatId) {
  //     console.log('get chat history');
  //     getChatHistory();
  //   }
  // }, [chatId, user]);

  // const handleSendMessage = (message: string) => {
  //   if (user && chatId) {
  //     socket.emit('message', { chatId, message, sender: user });
  //     setMessages((prev) => [...prev, { from: user?.type, text: message }]);
  //   }
  // };

  // if (!user) return null;
  const isAuthenticated = user !== null;

  const handleSendMessage = () => {};

  return (
    <div className='flex mt-24 justify-center w-full'>
      {isAuthenticated ? (
        <div className='flex gap-3'>
          <div className='flex flex-col gap-4 w-[500px] mt-10 text-center p-2'>
            {chats && chats.length > 0 ? (
              chats.map((chat, i) => (
                <ChatCard
                  key={`client-chat-${i}`}
                  onNameClick={() => setChatId(chat.id)}
                  chat={chat}
                />
              ))
            ) : (
              <div className='flex h-full w-full justify-center items-center'>
                <h3>No chats created yet</h3>
              </div>
            )}
          </div>
          {chatId ? (
            <div className='flex justify-center w-full'>
              <div className='w-full mx-auto'>
                <h1 className='mb-4 text-2xl font-bold'>Room: 1</h1>
                <div className='h-[500px] overflow-y-auto p-4 mb-4 bg-gray-200 border2 rounded-lg'>
                  {messages.map((msg, index) => (
                    <ChatMessage
                      key={index}
                      sender={msg.from.username}
                      message={msg.text}
                      isOwnMessage={
                        user.type === msg.from.type &&
                        user.username === msg.from.username
                      }
                    />
                  ))}
                </div>
                <ChatForm onSendMessage={handleSendMessage} />
              </div>
            </div>
          ) : (
            <div className='h-[500px] w-[400px] overflow-y-auto p-4 mb-4 bg-gray-200 border2 rounded-lg flex justify-center items-center'>
              <h3 className='h-fit'>Chat is not selected yet</h3>
            </div>
          )}
        </div>
      ) : (
        <AgentLoginForm onSuccess={(user) => setUser(user)} />
      )}
    </div>
  );
}
