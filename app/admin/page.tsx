'use client';

import ChatForm from '@/components/ChatForm';
import { SOCKET_EVENTS } from '@/lib/const';
import { socket } from '@/lib/socketClient';
import { TChat, TChatShorting, TUser } from '@/lib/type';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

type TCreateChatPayload = {
  status: 'success' | 'error';
  message: string;
  chat?: TChatShorting;
};

function UsersSection() {
  const [users, setUsers] = useState<TUser[] | null>();
  useEffect(() => {
    socket.emitWithAck('get-users', {}).then((data: TUser[]) => {
      setUsers(data);
    });
  }, []);

  const handleDeleteUser = (user: TUser) => {
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
          setUsers((prev) =>
            prev?.filter(
              (u) => u.type !== user.type && u.username && user.username
            )
          );
        }
      );
  };

  return (
    <div className='flex flex-col gap-2 font-bold'>
      <div className='flex justify-between items-center'>
        <h4 className='text-[20px]'>Users</h4>
      </div>

      <div className='flex flex-col gap-2'>
        {users && users.length > 0 ? (
          <table className='border-1'>
            <thead className='border-1'>
              <tr>
                <th className='border-1 p-1'>Username</th>
                <th className='border-1 p-1'>Type</th>
                <th className='border-1 p-1'>Actions</th>
              </tr>
            </thead>
            <tbody className='font-normal'>
              {users?.map((user) => (
                <tr
                  className='text-center'
                  key={`user-${user.type}-${user.username}`}
                >
                  <td className='border-1 p-1'>{user.username}</td>
                  <td className='border-1 p-1'>{user.username}</td>
                  <td className='p-1 flex justify-center items-center'>
                    <button
                      onClick={() => handleDeleteUser(user)}
                      className='cursor-pointer h-fit bg-red-500 p-2 rounded-lg text-white'
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className='text-center'>No users yet</div>
        )}
      </div>
    </div>
  );
}

function ChatsSection() {
  const [chats, setChats] = useState<TChatShorting[]>([]);
  const [createChatFormOpen, setCreateChatFormOpen] = useState(false);

  const addChat = (data: TChatShorting) => {
    setChats((r) => [data, ...r]);
  };

  const handleCreateNewChat = async (question: string) => {
    const result = (await socket.emitWithAck(SOCKET_EVENTS.CREATE_NEW_CHAT, {
      question,
    })) as TCreateChatPayload;

    if (result) {
      if (result.status === 'success' && result.chat) {
        addChat(result.chat);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    }
  };

  useEffect(() => {
    socket.emitWithAck('get-chats', {}).then((data: TChatShorting[]) => {
      setChats(data);
    });
  }, []);

  const handleDeleteChat = (chatId: TChat['id']) => {
    socket
      .emitWithAck('delete-chat', {
        chatId,
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
          setChats((prev) => prev?.filter((chat) => chat.id !== chatId));
        }
      );
  };

  return (
    <div className='flex flex-col gap-2 font-bold'>
      <div className='flex justify-between items-center'>
        <h4 className='text-[20px]'>Chats</h4>
        <button
          onClick={() => setCreateChatFormOpen((v) => !v)}
          className='cursor-pointer h-fit bg-blue-500 p-2 rounded-lg text-white'
        >
          {createChatFormOpen ? 'Close' : 'Create'}
        </button>
      </div>

      <div className='flex flex-col gap-2'>
        {chats && chats.length > 0 ? (
          <table className='border-1'>
            <thead className='border-1'>
              <tr>
                <th className='border-1 p-1'>ID</th>
                <th className='border-1 p-1'>createdAt</th>
                <th className='border-1 p-1'>LastMessage</th>
                <th className='border-1 p-1'>Actions</th>
              </tr>
            </thead>
            <tbody className='font-normal'>
              {chats?.map((chat) => (
                <tr className='text-center' key={`chat-${chat.id}`}>
                  <td className='border-1 p-1'>{chat.id}</td>
                  <td className='border-1 p-1'>
                    {new Date(chat.createdAt).toLocaleString()}
                  </td>
                  <td className='border-1 p-1'>
                    <strong>{chat.lastMessage.from.username}</strong>:{' '}
                    {chat.lastMessage.text}
                  </td>
                  <td className='p-1 flex justify-center items-center'>
                    <button
                      onClick={() => handleDeleteChat(chat.id)}
                      className='cursor-pointer h-fit bg-red-500 p-2 rounded-lg text-white'
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className='text-center'>No chats yet</div>
        )}
      </div>
      {createChatFormOpen && (
        <div className='p-2 flex flex-col gap-2 border-1 rounded-lg border-gray-500'>
          <h3 className='text-center'>Create chat</h3>
          <ChatForm
            placeholder={'Enter user quetion...'}
            onSendMessage={(question) => handleCreateNewChat(question)}
          />
        </div>
      )}
    </div>
  );
}

export default function AdminWorkflow() {
  // if (!users) return null;

  return (
    <div className='flex mt-24 justify-center w-full'>
      <div className='flex flex-col gap-4 w-[500px]'>
        <h3 className='text-[24px] font-bold'>Admind pannel</h3>
        <UsersSection />
        <ChatsSection />
      </div>
    </div>
  );
}
