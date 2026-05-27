"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromFormString } from "@/lib/utils";

export async function signUpAction(formData: FormData) {
  const email = fromFormString(formData.get("email"));
  const password = fromFormString(formData.get("password"));
  const displayName = fromFormString(formData.get("display_name"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || email.split("@")[0]
      }
    }
  });

  if (error) redirect(`/auth/register?message=${encodeURIComponent(error.message)}`);
  redirect("/auth/login?message=registered");
}

export async function signInAction(formData: FormData) {
  const email = fromFormString(formData.get("email"));
  const password = fromFormString(formData.get("password"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/auth/login?message=${encodeURIComponent(error.message)}`);

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth/login");
}
