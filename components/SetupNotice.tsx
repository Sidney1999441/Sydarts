import { Card } from "@/components/ui/Card";

export function SetupNotice() {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <div className="text-sm font-semibold text-amber-950">Supabase 尚未配置</div>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        复制 <code>.env.example</code> 为 <code>.env.local</code>，填写 Supabase URL、anon key
        和 service role key，然后执行数据库迁移。
      </p>
    </Card>
  );
}
