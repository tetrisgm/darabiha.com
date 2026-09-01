import DemoClient from "./DemoClient";
import { LanguageProvider } from "../components/LanguageContext";

export const metadata = { title: "Try the archivist · Darabiha" };
export default function DemoPage() { return <LanguageProvider initial="en"><DemoClient /></LanguageProvider>; }
