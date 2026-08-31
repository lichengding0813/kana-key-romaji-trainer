import type { Metadata } from "next";
import Trainer from "./trainer";

export const metadata: Metadata = {
  title: "かなキー｜新标日日语输入练习",
  description: "按《新标准日本语》课次练习词汇、假名与罗马音输入。",
};

export default function Home() {
  return <Trainer />;
}
