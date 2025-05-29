'use client';
import { socket } from '@/lib/socketClient';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AuthResponcePayload,
  TSupportChatPopulated,
  TSupportMessagePopulated,
  TSupportUser,
} from '@/lib/type';
import ChatMessage from '@/components/ChatMessage';
import ChatForm from '@/components/ChatForm';
import toast from 'react-hot-toast';

// function ClientLoginForm({ onSuccess }: { onSuccess: (user: TUser) => void }) {
//   const handleLogin = async (username: string) => {
//     const userData = {
//       username,
//       type: 'client',
//     } as TUser;

//     const result = (await socket.emitWithAck('login', userData)) as {
//       status: 'success' | 'error';
//       message: string;
//     };

//     if (result) {
//       if (result.status === 'success') {
//         onSuccess(userData);
//         toast.success(result.message);
//       } else {
//         toast.error(result.message);
//       }
//     }
//   };

//   const [username, setUsername] = useState('');

//   return (
//     <div className='flex flex-col gap-4 w-[500px] text-center'>
//       <h2 className='text-[24px] font-bold'>How should we call you?</h2>
//       <form
//         onSubmit={async (e) => {
//           e.preventDefault();
//           console.log('submit');
//           await handleLogin(username);
//         }}
//         className='w-full flex flex-col gap-3'
//       >
//         <input
//           type='text'
//           placeholder='Enter username'
//           className='flex-1 px-4 border-2 py-2 rounded-lg focus:outline-none'
//           value={username}
//           onChange={(e) => setUsername(e.target.value)}
//         />
//         <button
//           type='submit'
//           className='px-4 py-2 rounded-lg text-white bg-blue-500'
//         >
//           Submit
//         </button>
//       </form>
//     </div>
//   );
// }

export default function Home() {
  const searchParams = useSearchParams();

  const chatId = searchParams.get('chat');

  const [messages, setMessages] = useState<TSupportMessagePopulated[]>([]);

  const [user, setUser] = useState<TSupportUser | null>(null);

  const isAuthenticated = user !== null;

  useEffect(() => {
    async function checkoutUser() {
      if (window) {
        const userId = localStorage.getItem('clientId');
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
            .catch(() => console.log('Failed to refresh agent'));
        }
      }
    }
    checkoutUser();
  }, []);

  useEffect(() => {
    if (isAuthenticated && chatId) {
      socket
        .emitWithAck('join-chat', { chatId, user })
        .then((chat: TSupportChatPopulated) => {
          setMessages((prev) => [
            ...prev.filter((m) => m.type === 'system'),
            ...chat.messages,
          ]);
        });
    }
  }, [isAuthenticated, chatId, user]);

  useEffect(() => {
    socket.on('message', (data) => {
      console.log(' received message from socket');
      setMessages((prev) => [...prev, data]);
    });

    socket.on('user_joined', (message: TSupportMessagePopulated) => {
      setMessages((prev) => [...prev, message]);
    });

    socket.on('user_left', (message) => {
      setMessages((prev) => [
        ...prev,
        {
          from: { username: '', type: 'client', socketId: socket?.id || '' },
          type: 'system',
          text: message,
        },
      ]);
    });

    return () => {
      socket.off('message');
      socket.off('user_joined');
      socket.off('user_left');
      if (user) socket.emitWithAck('logout', { user });
    };
  }, [user]);

  const handleSendMessage = async (messageText: string) => {
    if (user && chatId) {
      const messageBody = {
        type: 'user',
        text: messageText,
        senderId: user.id,
        chatId,
      };

      const message = (await socket.emitWithAck(
        'message',
        messageBody
      )) as TSupportMessagePopulated;

      setMessages((prev) => [...prev, message]);
    }
  };

  useEffect(() => {
    if (chatId) {
      socket
        .emitWithAck('get-client-data', { chatId })
        .then((data: TSupportUser) => {
          setUser(data);
        });
    }
  }, [chatId]);

  return (
    <div className='flex mt-24 justify-center w-full'>
      {isAuthenticated ? (
        chatId ? (
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
            <ChatForm onSendMessage={handleSendMessage} />
          </div>
        ) : (
          <div className='w-full max-w-3xl mx-auto flex justify-center items-center'>
            <h3>{"You're not connected to any room"}</h3>
          </div>
        )
      ) : (
        <div>Loading...</div>
      )}
    </div>
  );
}
