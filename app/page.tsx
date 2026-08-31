import type { Metadata } from "next";
import Trainer from "./trainer";

export const metadata: Metadata = {
  title: "かなキー｜五十音、单词与语法训练",
  description: "练习五十音输入，并按《新标准日本语》课次记忆单词、阅读语法辨析与例句。",
};

export default function Home() {
  return <Trainer />;
}
