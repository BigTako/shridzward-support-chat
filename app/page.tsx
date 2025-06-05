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

  const [messages, setMessages] = useState<TMessagePopulated[] | null>([]);

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
          setMessages((prev) =>
            prev
              ? [
                  ...prev.filter((m) => m.type === 'system'),
                  ...(chat.messages || []),
                ]
              : chat.messages || []
          );
        })
        .finally(() => setIsJoiningChat(false));
    }
  }, [isAuthenticated, chatId, user]);

  useEffect(() => {
    socket.on('message', (data) => {
      setMessages((prev) => (prev ? [...prev, data] : [data]));
    });

    socket.on('user_joined', (message: TMessagePopulated) => {
      setMessages((prev) => (prev ? [...prev, message] : [message]));
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
      setMessages((prev) => (prev ? [...prev, message] : [message]));
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

  if (
    isRefresingUser ||
    isGettingClientData ||
    isJoiningChat ||
    !messages ||
    !chatId
  ) {
    return (
      <div className='h-screen w-screen flex justify-center items-center'>
        <h3>{chatId ? 'Loading...' : "You're not connected to any room"}</h3>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3 justify-center items-center h-screen w-screen'>
      <h3 className='text-[24px]'>
        <strong>Chat with Support Agent</strong>
      </h3>
      <div className='h-[600px] w-[600px] shadow-[0px_0px_8px_0px_rgba(0,0,0,0.25)] rounded-[10px] p-2'>
        <div className='w-full h-full flex flex-col gap-2'>
          <div className='flex flex-col overflow-y-auto flex-1 h-[400px]'>
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
      </div>
    </div>
  );
}
