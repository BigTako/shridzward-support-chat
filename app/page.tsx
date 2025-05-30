'use client';
import { socket } from '@/lib/socketClient';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AuthResponcePayload,
  TChatPopulated,
  TMessagePopulated,
  TUser,
} from '@/lib/type';
import ChatMessage from '@/components/ChatMessage';
import ChatForm from '@/components/ChatForm';
import toast from 'react-hot-toast';

export default function Home() {
  const searchParams = useSearchParams();

  const chatId = searchParams.get('chat');

  const [messages, setMessages] = useState<TMessagePopulated[]>([]);

  const [user, setUser] = useState<TUser | null>(null);

  const [isRefresingUser, setIsRefreshingUser] = useState<boolean>(true);
  const [isGettingClientData, setIsGettingClientData] = useState<boolean>(true);
  const [isJoiningChat, setIsJoiningChat] = useState<boolean>(true);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);

  const isAuthenticated = user !== null;

  useEffect(() => {
    async function checkoutUser() {
      if (window) {
        const userId = localStorage.getItem('clientId');
        setIsRefreshingUser(true);
        if (userId) {
          await socket
            .emitWithAck('refresh-user', { userId })
            .then((result: AuthResponcePayload) => {
              if (result.status === 'success' && result._meta) {
                const newUser = result._meta.user;
                setUser(newUser);
                localStorage.setItem('userId', newUser.id);
                console.log('Agent refreshed');
              } else {
                toast.error(result.message);
              }
            })
            .catch(() => console.log('Failed to refresh agent'))
            .finally(() => {
              setIsRefreshingUser(false);
              setIsGettingClientData(false);
            });
        }
      }
    }
    checkoutUser();
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
        })
        .finally(() => setIsJoiningChat(false));
    }
  }, [isAuthenticated, chatId, user]);

  useEffect(() => {
    socket.on('message', (data) => {
      console.log(' received message from socket');
      setMessages((prev) => [...prev, data]);
    });

    socket.on('user_joined', (message: TMessagePopulated) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.off('message');
      socket.off('user_joined');
      if (user) socket.emitWithAck('logout', { user });
    };
  }, [user]);

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

  useEffect(() => {
    if (chatId) {
      setIsGettingClientData(true);
      socket
        .emitWithAck('get-client-data', { chatId })
        .then((data: TUser) => {
          setUser(data);
        })
        .finally(() => {
          setIsRefreshingUser(false);
          setIsGettingClientData(false);
        });
    }
  }, [chatId]);

  return (
    <div className='flex mt-24 justify-center w-full'>
      {isRefresingUser || isGettingClientData || isJoiningChat ? (
        <div className='flex h-full w-full justify-center items-center'>
          <h3>Loading...</h3>
        </div>
      ) : chatId ? (
        <div className='w-full max-w-3xl mx-auto'>
          <h1 className='mb-4 text-2xl font-bold'>Room: 1</h1>
          <div className='h-[500px] overflow-y-auto p-4 mb-4 bg-gray-200 border2 rounded-lg'>
            {messages.map((msg, index) => (
              <ChatMessage
                key={index}
                message={msg}
                isOwnMessage={Boolean(
                  user && msg.sender && user?.id === msg.sender?.id
                )}
              />
            ))}
          </div>
          <ChatForm
            isLoading={isSendingMessage}
            onSendMessage={handleSendMessage}
          />
        </div>
      ) : (
        <div className='w-full max-w-3xl mx-auto flex justify-center items-center'>
          <h3>{"You're not connected to any room"}</h3>
        </div>
      )}
    </div>
  );
}
