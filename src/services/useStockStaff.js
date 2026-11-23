import {useEffect,useState} from "react";
import {supabase} from "../supabaseClient.js";

// Hides private content immediately on account/session changes. The server checks again.
export default function useStockStaff() {
  const [actor,setActor]=useState("");
  useEffect(()=>{
    if(!supabase)return undefined;
    let stopped=false,sequence=0;
    async function check() {
      const current=++sequence;
      setActor("");
      try {
        const {data:{user}={},error:userError}=await supabase.auth.getUser();
        if(userError||!user?.id||user.is_anonymous)return;
        const {data,error}=await supabase.rpc("is_admin");
        if(!stopped&&current===sequence&&!error&&data===true)setActor(user.id);
      }catch{/* Private tools stay hidden when authorization cannot be confirmed. */}
    }
    check();
    const {data:{subscription}={}}=supabase.auth.onAuthStateChange(()=>{
      ++sequence;setActor("");
      // Do not await Auth calls inside Supabase's auth callback.
      queueMicrotask(()=>{if(!stopped)check();});
    });
    return ()=>{stopped=true;++sequence;subscription?.unsubscribe();};
  },[]);
  return actor;
}
