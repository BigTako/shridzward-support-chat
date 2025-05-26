'use client';
import { socket } from '@/lib/socketClient';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TChat, TMessage, TUser } from '@/lib/type';
import ChatMessage from '@/components/ChatMessage';
import ChatForm from '@/components/ChatForm';

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

  const [messages, setMessages] = useState<TMessage[]>([]);

  const [user, setUser] = useState<TUser | null>(null);

  useEffect(() => {
    if (user && chatId) {
      socket.emitWithAck('join-chat', { chatId, user }).then((chat: TChat) => {
        setMessages((prev) => [
          ...prev.filter((m) => m.type === 'system'),
          ...chat.messages,
        ]);
      });
    }
  }, [user, chatId]);

  useEffect(() => {
    socket.on('message', (data) => {
      console.log(' received message from socket');
      setMessages((prev) => [...prev, data]);
    });

    socket.on('user_joined', (message) => {
      setMessages((prev) => [
        ...prev,
        {
          from: { username: '', type: 'client', socketId: socket?.id || '' },
          type: 'system',
          text: message,
        },
      ]);
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

  useEffect(() => {
    if (chatId) {
      socket.emitWithAck('get-client-data', { chatId }).then((data: TUser) => {
        setUser(data);
      });
    }
  }, [chatId]);

  const isAuthenticated = user !== null;

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
                  isOwnMessage={
                    user?.type === msg.from.type &&
                    user?.username === msg.from.username
                  }
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
        // <ClientLoginForm
        //   onSuccess={(user) => {
        //     setUser(user);
        //   }}
        // />
      )}
    </div>
  );
}
