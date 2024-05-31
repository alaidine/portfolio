"use client";

import { TypewriterEffectSmooth } from "@/components/ui/typewriter-effect";
import { Tabs } from "@/components/ui/tabs";
import { useState } from "react";

function Greeting() {
  return (
    <div className="flex flex-col items-center justify-center">
      <TypewriterEffectSmooth
        words={[
          {
            text: "Welcome to my Portfolio",
            className: "text-4xl font-bold text-white",
          },
        ]}
      />
    </div>
  );
}

function MyTabs() {
  const [darkMode, setDarkMode] = useState(true); // TODO: Add dark mode toggle
  
  const tabs = [
    {
      title: "About",
      value: "about",
      content: (
        <div className="w-full overflow-hidden relative h-full rounded-2xl p-10 text-xl md:text-4xl font-bold text-white bg-gradient-to-br from-purple-700 to-violet-900">
          <Greeting />
        </div>
      ),
    },
  ];

  return (
    <div className={`${darkMode ? 'dark' : ''} h-[20rem] md:h-[40rem] [perspective:1000px] relative b flex flex-col max-w-5xl mx-auto w-full  items-start justify-start my-40`}>
      <Tabs tabs={tabs} />
    </div>
  );
}

export default function Home() {
  return <MyTabs />;
}
