'use client';

import { ChatCard } from '@/components/ChatCard';
import ChatForm from '@/components/ChatForm';
import ChatMessage from '@/components/ChatMessage';
import { socket } from '@/lib/socketClient';
import {
  AuthResponcePayload,
  TChatPopulated,
  TChatShorting,
  TMessagePopulated,
  TUser,
} from '@/lib/type';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AgentLoginForm } from './_components/AgentLoginForm';

export default function AgentPage() {
  const [chatId, setChatId] = useState<TChatShorting['id'] | null>(null);

  const [chats, setChats] = useState<TChatShorting[]>([]);

  const [user, setUser] = useState<TUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<TMessagePopulated[]>([]);
  const [isRefresingUser, setIsRefreshingUser] = useState<boolean>(true);
  const [isGettingChats, setIsGettingChats] = useState<boolean>(true);
  const [isJoiningChat, setIsJoiningChat] = useState<boolean>(false);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [isLoggingOut, setIsLogginOut] = useState<boolean>(false);

  useEffect(() => {
    async function checkoutUser() {
      if (window) {
        const userId = localStorage.getItem('userId');
        if (userId) {
          setIsRefreshingUser(true);
          await socket
            .emitWithAck('refresh-user', { userId })
            .then((result: AuthResponcePayload) => {
              if (result.status === 'success' && result._meta) {
                const newUser = result._meta.user;
                setIsAuthenticated(true);
                setUser(newUser);
                localStorage.setItem('userId', newUser.id);
                console.log('Agent refreshed');
              } else {
                toast.error(result.message);
              }
            })
            .catch(() => console.log('Failed to refresh agent'))
            .finally(() => setIsRefreshingUser(false));
        } else {
          setIsAuthenticated(false);
          setIsRefreshingUser(false);
        }
      }
    }
    checkoutUser();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setIsGettingChats(true);
      socket.emitWithAck('get-chats', {}).then((data: TChatShorting[]) => {
        console.log({ data });
        setChats(data);
        setIsGettingChats(false);
      });
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (document) {
      document.title = isAuthenticated
        ? 'Support Agent Page'
        : 'Support Agent Login';
    }
  }, [isAuthenticated]);

  useEffect(() => {
    socket.on('new-client-chat', (data: TChatShorting) => {
      console.log('received chat from socket');
      setChats((prev) => [data, ...prev]);
    });

    socket.on('message', (data) => {
      console.log(' received message from socket');
      setMessages((prev) => [...prev, data]);
    });

    socket.on('user_joined', (message: TMessagePopulated) => {
      setMessages((prev) => [...prev, message]);
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
      setIsJoiningChat(true);
      socket
        .emitWithAck('join-chat', { chatId, user })
        .then((chat: TChatPopulated) => {
          setMessages((prev) => [
            ...prev.filter((m) => m.type === 'system'),
            ...(chat.messages || []),
          ]);
          setIsJoiningChat(false);
        });
    }
  }, [isAuthenticated, chatId, user]);

  const handleSendMessage = async (messageText: string) => {
    if (user && chatId) {
      setIsSendingMessage(true);
      const messageBody = {
        type: 'user',
        text: messageText,
        senderId: user.id,
        chatId,
      };

      const message = (await socket.emitWithAck(
        'message',
        messageBody
      )) as TMessagePopulated;

      setIsSendingMessage(false);
      setMessages((prev) => [...prev, message]);
    }
  };

  const handleLogout = () => {
    if (window && user) {
      setIsLogginOut(true);
      socket
        .emitWithAck('logout', {
          userId: user.id,
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
          setIsLogginOut(false);
        });
    }
  };

  return (
    <>
      <div className='flex mt-24 justify-center w-full'>
        <div className='flex flex-col gap-1'>
          {isRefresingUser ? (
            <div className='flex h-full w-full justify-center items-center'>
              <h3>Loading...</h3>
            </div>
          ) : (
            <>
              {isAuthenticated && (
                <div className='flex justify-end'>
                  <button
                    onClick={handleLogout}
                    className='px-4 py-2 h-fit bg-red-500 text-white font-bold rounded-lg'
                  >
                    <span>{isLoggingOut ? '.......' : 'Log Out'}</span>
                  </button>
                </div>
              )}
              {isAuthenticated === null ? (
                <div className='w-full h-full justify-center items-center'>
                  Loading...
                </div>
              ) : isAuthenticated ? (
                <div className='flex gap-3'>
                  <div className='flex flex-col gap-4 w-[500px] mt-10 text-center p-2'>
                    {isGettingChats ? (
                      <div className='flex h-full w-full justify-center items-center'>
                        <h3>Loading</h3>
                      </div>
                    ) : chats && chats.length > 0 ? (
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
                  {isJoiningChat ? (
                    <div className='h-[500px] w-[500px] overflow-y-auto p-4 mb-4 bg-gray-200 border2 rounded-lg flex justify-center items-center'>
                      <h3 className='h-fit'>Loading...</h3>
                    </div>
                  ) : chatId ? (
                    <div className='flex justify-center w-fit'>
                      <div className='w-fit mx-auto flex flex-col gap-1'>
                        <h1 className='mb-4 text-2xl font-bold'>
                          Chat: {chatId}
                        </h1>
                        <div className='h-[500px] w-[500px] overflow-y-auto p-4 mb-3 bg-gray-200 border2 rounded-lg'>
                          {messages.map((msg, index) => (
                            <ChatMessage
                              key={index}
                              message={msg}
                              isOwnMessage={Boolean(
                                user &&
                                  msg.sender &&
                                  user?.id === msg.sender?.id
                              )}
                            />
                          ))}
                        </div>
                        <ChatForm
                          isLoading={isSendingMessage}
                          onSendMessage={handleSendMessage}
                        />
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
                    setUser({ ...user, socketId: socket?.id || '' });
                    setIsAuthenticated(true);
                    if (window) {
                      localStorage.setItem('userId', user.id);
                    }
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
