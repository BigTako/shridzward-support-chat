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

  const [chats, setChats] = useState<TChatShorting[]>([]);

  const [user, setUser] = useState<TUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<TMessage[]>([]);

  useEffect(() => {
    if (window) {
      const userData = JSON.parse(localStorage.getItem('user') || 'null');
      setIsAuthenticated(userData !== null);
      setUser(userData);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      socket.emitWithAck('get-chats', {}).then((data: TChatShorting[]) => {
        console.log({ data });
        setChats(data);
      });
    }
  }, [isAuthenticated]);

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

    socket.on('user_left', (message) => {
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
      socket.off('user_left');
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && chatId) {
      socket
        .emitWithAck('join-chat', { chatId, user })
        .then((data: TMessage[]) => {
          setMessages((prev) => [
            ...prev.filter((m) => m.type === 'system'),
            ...data,
          ]);
        });
    }
  }, [isAuthenticated, chatId, user]);

  const handleSendMessage = (messageText: string) => {
    if (user && chatId) {
      const message = {
        type: 'user',
        text: messageText,
        from: user,
      } as TMessage;
      socket.emit('message', { chatId, message });
      setMessages((prev) => [...prev, message]);
    }
  };

  const handleLogout = () => {
    if (window) {
      socket
        .emitWithAck('logout', {
          user,
        })
        .then(
          ({
            status,
            message,
          }: {
            status: 'success' | 'error';
            message: string;
          }) => {
            if (status === 'success') {
              toast.success(message);
            } else {
              toast.error(message);
            }
          }
        )
        .finally(() => {
          setUser(null);
          setIsAuthenticated(false);
          localStorage.removeItem('user');
        });
    }
  };

  // if (!isAuthenticated || !user) return null;

  return (
    <div className='flex mt-24 justify-center w-full'>
      <div className='flex flex-col gap-1'>
        {isAuthenticated && (
          <div className='flex justify-end'>
            <button
              onClick={handleLogout}
              className='px-4 py-2 h-fit bg-red-500 text-white font-bold rounded-lg'
            >
              <span>Log Out</span>
            </button>
          </div>
        )}
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
              <div className='flex justify-center w-fit'>
                <div className='w-fit mx-auto flex flex-col gap-1'>
                  <h1 className='mb-4 text-2xl font-bold'>Chat: {chatId}</h1>
                  <div className='h-[500px] w-[500px] overflow-y-auto p-4 mb-3 bg-gray-200 border2 rounded-lg'>
                    {messages.map((msg, index) => (
                      <ChatMessage
                        key={index}
                        message={msg}
                        isOwnMessage={
                          user?.type === msg.from.type &&
                          user?.username === msg.from.username
                        }
                      />
                    ))}
                  </div>
                  <ChatForm onSendMessage={handleSendMessage} />
                </div>
              </div>
            ) : (
              <div className='h-[500px] w-[500px] overflow-y-auto p-4 mb-4 bg-gray-200 border2 rounded-lg flex justify-center items-center'>
                <h3 className='h-fit'>Chat is not selected yet</h3>
              </div>
            )}
          </div>
        ) : (
          <AgentLoginForm
            onSuccess={(user) => {
              console.log({ user });
              setUser(user);
              setIsAuthenticated(true);
              if (window) {
                localStorage.setItem('user', JSON.stringify(user));
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
