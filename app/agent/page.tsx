'use client';

import { fromMapping } from '@/lib/const';
import { TRoom } from '@/lib/type';
import { useUser } from '@/lib/useUser';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AgentPage() {
  const [rooms, setRooms] = useState<TRoom[]>([]);
  const router = useRouter();
  const { user, isLoggedIn } = useUser();

  useEffect(() => {
    if (window) {
      if (isLoggedIn === false || (user && user.type !== 'agent')) {
        router.push('/agent/login');
      }
    }
  }, [router, user, isLoggedIn]);

  return (
    <div className='flex mt-24 justify-center w-full'>
      <div className='flex flex-col gap-4 w-[500px] text-center p-2'>
        {rooms.map((chat, i) => (
          <div
            className='flex flex-col gap-3 justify-center p-2 border-[1px] border-black rounded-lg'
            key={`message-${i}`}
          >
            <div className='flex gap-2'>
              <Image
                className='h-[50px] w-[50px] rounded-full'
                src='https://www.assuropoil.fr/wp-content/uploads/2023/07/avoir-un-chat-sante.jpg'
                alt='Client image'
                width={540}
                height={840}
              />
              <div className='flex-1 flex flex-col gap-1 max-w-full truncate'>
                <h3 className='font-bold'>Room: {chat.roomId}</h3>
                <h3 className='truncate text-ellipsis max-w-full'>
                  {fromMapping[chat.from]}: {chat.lastMessage}
                </h3>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
