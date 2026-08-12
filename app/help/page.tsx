import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  ImagePlus,
  ListChecks,
  Palette,
  ShieldCheck,
  Target,
  Trophy,
  UserRound,
  UsersRound
} from "lucide-react";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Card } from "@/components/ui/Card";
import { defaultSiteTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const quickStart = [
  {
    title: "注册并记住 UID",
    text: "每个账号都有 6 位 UID。现场报名、后台加人、队伍报名、计分器选人都建议用 UID，速度最快，也不容易重名。"
  },
  {
    title: "选择身份入口",
    text: "选手看个人中心，队长看我的队伍，计分员进计分器，管理员进后台。所有入口都在顶部导航和移动端底部导航。"
  },
  {
    title: "先处理首页本周赛程",
    text: "登录后首页会置顶显示本周需要处理的比赛，默认一软一硬；未完成的补赛会标黄保留，并可直接预约、排兵布阵或进入计分。"
  },
  {
    title: "创建或报名赛事",
    text: "管理员创建赛事并开放报名；选手或队长报名。双人赛和队制赛需要关注队长、成员和本次赛事队伍。"
  },
  {
    title: "确认赛制模板",
    text: "同一场 BO 不能软硬混合；可以设置每局组合，例如双人 501、单人 501、单人 301。联赛可按轮次软硬交替。"
  },
  {
    title: "计分或录入结果",
    text: "硬式比赛使用实时计分器；软式比赛从计分器进入按局手动录入机台结果。双人/队制里的单人局，需要保存本局实际上场选手。"
  },
  {
    title: "赛后看统计",
    text: "个人中心和队伍历史会汇总胜负、平均分、MPR、TON80、帽子戏法、高拆、白马和段位变化。"
  }
];

const roleGuides: Array<{
  title: string;
  icon: IconType;
  href: string;
  action: string;
  goal: string;
  items: string[];
  cautions: string[];
}> = [
  {
    title: "选手",
    icon: UserRound,
    href: "/profile",
    action: "进入个人中心",
    goal: "完成报名、确认成绩、追踪自己的硬式/软式数据。",
    items: [
      "查看 UID、头像、段位、赛事 rating、平时 rating、软式 rating。",
      "查看自己报名中的赛事、待确认成绩和过往比赛记录。",
      "收到手动成绩确认时，先核对比分和个人数据，再确认。",
      "头像可直接上传本地图片，裁剪压缩后保存。"
    ],
    cautions: ["不要把 UID 当密码，它只是现场快速识别码。", "成绩有争议时不要确认，联系管理员处理。"]
  },
  {
    title: "队长",
    icon: UsersRound,
    href: "/profile",
    action: "管理我的队伍",
    goal: "维护长期队伍，并用它报名不同赛事。",
    items: [
      "维护长期队伍名称和头像。",
      "报名新赛事时选择长期队伍，再录入本次实际上场成员 UID。",
      "长期队伍只保存队名、头像、队长和历史，不固定成员名单。",
      "查看长期队伍所有过往赛事、成员快照和基础战绩。"
    ],
    cautions: ["长期队伍报名时必须包含队长。", "不同赛事可以使用不同成员，赛后历史会按赛事实例保留。"]
  },
  {
    title: "计分员",
    icon: Gauge,
    href: "/scorer",
    action: "打开计分器",
    goal: "让比赛现场快速、稳定地完成计分。",
    items: [
      "正式硬式比赛从计分器列表进入，系统按赛事局制自动读取规则。",
      "平时切磋从计分器创建临时对战，数据写入普通统计。",
      "双人/队制中出现单人局时，开始前选择双方本局出场选手。",
      "软式比赛从计分器进入手动录入页，只显示当前项目真正需要的数据。"
    ],
    cautions: ["同一场 BO 内不要软硬混合。", "切局前确认本局胜方和上场名单，避免个人数据归属错误。"]
  },
  {
    title: "管理员",
    icon: ShieldCheck,
    href: "/admin",
    action: "进入后台",
    goal: "管理赛事全生命周期、用户、队伍、主题和最终成绩。",
    items: [
      "创建赛事、开放报名、生成参赛主体、生成分组和赛程。",
      "用 UID 搜索用户，维护角色、状态、三套 rating 和资料。",
      "管理长期队伍和赛事内队伍，设置队长、头像和成员。",
      "处理手动录入、成绩确认、争议和赛后统计。"
    ],
    cautions: ["生成赛程前先确认报名名单和队伍人数。", "手动改成绩会影响统计和段位，发布前必须复核。"]
  }
];

const workflows = [
  {
    title: "管理员：从 0 到开赛",
    icon: CalendarDays,
    steps: [
      "进入后台，点击创建赛事。",
      "填写名称、地点、报名时间、比赛开始时间、人数上限。",
      "选择赛事类型：个人赛、双人赛或队制赛，并确认每队人数。",
      "选择镖种：硬式、软式或轮次软硬交替。注意：同一场 BO 内不能软硬混合。",
      "选择赛制模式。标准模式适合普通 BO；自定义每局适合双人局和单人局组合。",
      "设置结束方式：领先过半即结束，或打满全部配置局。",
      "发布赛事并开放报名。",
      "报名截止后，进入参赛选手管理，确认选手、搭档、长期队伍和赛事内队伍。",
      "生成队伍/参赛主体，再生成分组和赛程。",
      "开赛前检查每场比赛的镖种、项目、BO 模板和手动录入开关。"
    ]
  },
  {
    title: "赛事现场：硬式比赛",
    icon: Target,
    steps: [
      "选手或计分员进入计分器。",
      "选择自己的正式比赛。",
      "系统读取该场比赛的 leg_rules，自动显示当前局项目和起始分。",
      "如果当前局是团队里的单人局，先选择双方出场选手。",
      "按回合录入分数，结账成功后自动切到下一局。",
      "若赛事设置为领先过半，达到胜局后自动结束；若设置为打满，则继续完成全部局。",
      "保存结果后，硬式数据写入比赛历史、个人统计和段位计算。"
    ]
  },
  {
    title: "赛事现场：软式比赛",
    icon: ClipboardList,
    steps: [
      "软式比赛从首页本周赛程或计分器列表进入。",
      "双方确认本场每局出场顺序后，进入按局录入。",
      "选择胜方、比分、每局上场名单。",
      "01 项目可直接填 PPR，也可填 PPD 自动换算；米老鼠填写 MPR、Mark 和白马；高分赛只填写本局得分与可选特殊数据。",
      "保存后进入待确认或直接结算，视当前流程和权限而定。",
      "软式数据会以较低权重影响个人段位；长期只打软式的选手仍会获得匹配水平。"
    ]
  },
  {
    title: "队伍：长期队伍与赛事队伍",
    icon: UsersRound,
    steps: [
      "长期队伍保存队名、头像、队长和历史关联。",
      "赛事队伍保存本次赛事的实际成员、队长、头像快照和成绩。",
      "管理员可把赛事队伍保存为长期队伍。",
      "队长或管理员可把长期队伍报名到新赛事。",
      "复用长期队伍时，不自动复用旧成员，必须重新选择本次成员。",
      "队伍历史页按长期队伍汇总所有关联的赛事队伍实例。"
    ]
  }
];

const featureGroups: Array<{ title: string; icon: IconType; items: string[]; checks: string[] }> = [
  {
    title: "账号、UID 与资料",
    icon: UserRound,
    items: [
      "UID 是系统自动生成的 6 位数字，不可由用户修改。",
      "用户资料包含显示名、头像、手机号、简介、角色、状态和多套 rating。",
      "后台用户搜索支持 UID、姓名和 UUID。"
    ],
    checks: ["新用户必须有 UID。", "用户状态为 banned 时应阻止关键操作。", "上传头像后保存资料不能清空头像。"]
  },
  {
    title: "赛事与赛制",
    icon: CalendarDays,
    items: [
      "支持个人赛、双人赛、队制赛。",
      "支持小组循环和淘汰赛基础流程。",
      "支持标准 BO 和自定义每局模板。"
    ],
    checks: ["软硬交替只能按轮次，不在同一场 BO 内混合。", "雪分制 501/701 只允许双人局。", "生成赛程时每场比赛复制赛事模板。"]
  },
  {
    title: "硬式与软式",
    icon: Trophy,
    items: [
      "硬式支持 301、501、701。",
      "软式支持 301、501、米老鼠、雪分制 501、雪分制 701。",
      "软式采用按局手动录入，01 支持 PPD 到 PPR 自动换算，同时预留软镖机接入 API。"
    ],
    checks: ["硬式比赛可进入实时计分器。", "软式比赛只显示当前项目需要的字段。", "软式个人数据写入软式统计。"]
  },
  {
    title: "本周赛程与赛道预约",
    icon: CalendarDays,
    items: [
      "首页置顶显示登录用户本周要处理的比赛。",
      "系统按一软一硬节奏挑选本周比赛，未完成的旧比赛会作为补赛标黄追加。",
      "机台预约集中在首页本周赛程里操作，支持按日期查看 7 天内空闲时段、预约、改约和取消。"
    ],
    checks: ["赛事详情页只展示预约状态，不再提供预约入口。", "不可用时段不会出现在可预约列表。", "已预约比赛会同步显示时间和机台。"]
  },
  {
    title: "计分器",
    icon: Gauge,
    items: [
      "正式硬式比赛读取比赛规则并自动切局。",
      "平时切磋独立于赛事，可用于训练或临时对战。",
      "触摸屏场景采用大按钮、少说明、快速反馈。"
    ],
    checks: ["按钮点击不应有明显阻塞。", "本局结束后状态一致。", "刷新后不能导致已保存数据丢失。"]
  },
  {
    title: "手动成绩与数据归属",
    icon: ClipboardCheck,
    items: [
      "手动录入支持胜负、比分、每局出场名单。",
      "软式支持平均分、MPR、TON80、帽子戏法、高拆、白马。",
      "成绩需要归属到实际出场个人。"
    ],
    checks: ["双人/队制里的单人局必须选择上场选手。", "比分与胜方必须一致。", "争议结果不应直接进入最终统计。"]
  },
  {
    title: "CODL 视觉与触摸体验",
    icon: Palette,
    items: [
      "全站已固定为 CODL 黑白蓝视觉，后台主题保留为维护入口。",
      "默认视觉为黑、蓝、橙极简风格。",
      "移动端底部导航覆盖赛事、计分、个人、说明和后台。"
    ],
    checks: ["主题保存后首页、后台、表单同步变化。", "移动端底部导航不遮挡关键按钮。", "文本不应挤出按钮或卡片。"]
  }
];

const examples = [
  {
    title: "硬式自定义三局：双人 501、单人 501、单人 301",
    result: "适合双人赛中穿插单人对抗的比赛。",
    steps: [
      "后台创建赛事，赛事类型选双人赛，每队人数 2。",
      "镖种选择硬式。",
      "赛制模式选择自定义每局。",
      "第 1 局选择双人、501；第 2 局选择单人、501；第 3 局选择单人、301。",
      "结束方式按规则选择领先过半或打满全部配置局。",
      "生成赛程后，计分器会按第 1、2、3 局自动切换。"
    ]
  },
  {
    title: "软式：501、米老鼠、雪分制 501",
    result: "适合软镖机线下出分后统一录入。",
    steps: [
      "后台创建赛事，镖种选择软式。",
      "自定义每局中依次添加软式 501、米老鼠、雪分制 501。",
      "雪分制 501 的参与模式必须为双人。",
      "比赛后从计分器手动录入胜方、比分和每位选手个人数据；01 可填 PPD 自动换算 PPR。",
      "保存后个人软式统计和段位权重更新。"
    ]
  },
  {
    title: "一轮软式、一轮硬式联赛",
    result: "适合同时运营软镖机和硬镖靶的联赛。",
    steps: [
      "创建赛事时镖种选择软硬交替。",
      "设定第一轮从软式或硬式开始。",
      "分别配置软式模板和硬式模板。",
      "系统排赛时按轮次切换；同一场 BO 内仍保持单一镖种。",
      "首页本周赛程会同时列出本周软式和硬式；硬式实时计分，软式按局手动录入。"
    ]
  },
  {
    title: "长期队伍报名新赛事",
    result: "保留队伍品牌和历史，同时允许每次赛事更换成员。",
    steps: [
      "后台或队长个人中心维护长期队伍。",
      "进入赛事报名页，选择长期队伍。",
      "输入本次上场成员 UID，成员数量必须符合赛事每队人数。",
      "系统创建赛事内队伍，并关联长期队伍。",
      "赛后队伍历史页可看到这次赛事实例。"
    ]
  },
  {
    title: "头像上传",
    result: "个人、长期队伍、赛事内队伍都用同一套上传体验。",
    steps: [
      "点击上传头像。",
      "选择 JPEG、PNG 或 WebP，原图不超过 8MB。",
      "拖动图片调整位置，使用滑杆缩放。",
      "确认上传后系统压缩为 512x512 WebP。",
      "上传成功后刷新页面仍显示新头像。"
    ]
  }
];

const releaseChecks = [
  {
    title: "P0 阻断项",
    items: [
      "首页、登录、注册、赛事列表、计分器、个人中心、帮助页必须可访问。",
      "管理员登录后能进入后台、赛事、用户、队伍和主题维护页面。",
      "创建赛事、生成赛程、硬式计分、手动录入、个人统计不能出现阻断错误。",
      "数据库迁移必须已应用，关键表和字段存在。"
    ]
  },
  {
    title: "P1 上线前必须复核",
    items: [
      "软式手动录入的个人数据字段完整。",
      "首页本周赛程能预约、改约、取消机台。",
      "队伍头像和个人头像上传权限正确。",
      "移动端底部导航和触摸按钮不遮挡表单提交。",
      "后台用户编辑不会误清空头像、UID 或 rating。"
    ]
  },
  {
    title: "P2 可延期优化",
    items: [
      "软镖机平台实时接入。",
      "头像历史文件清理。",
      "更细的审计日志和操作撤销。",
      "更多自动化端到端测试覆盖。"
    ]
  }
];

const qa = [
  {
    q: "UID 是什么？为什么不直接用姓名？",
    a: "UID 是 6 位数字识别码，用于现场快速搜索。姓名容易重名或临时改名，UID 更适合计分器、后台加队员和赛事报名。"
  },
  {
    q: "同一场 BO 可以一局软式一局硬式吗？",
    a: "不可以。同一场 BO 必须保持单一镖种，避免计分器状态和结算规则混乱。联赛可以按轮次软硬交替。"
  },
  {
    q: "为什么软式是手动录入？",
    a: "当前软镖机来自不同设备，实时数据还未统一接入，所以软式进入的是按局录入界面。01 可以填 PPD 自动换算 PPR，高分赛只填本局得分。"
  },
  {
    q: "本周赛程怎么决定？",
    a: "首页会优先显示本周已预约的比赛和未完成补赛，再按每周一软一硬的节奏追加下一场待打比赛。补赛不会替换本周新比赛，会标黄显示。"
  },
  {
    q: "雪分制为什么只能双人？",
    a: "当前系统把雪分制 501/701 定义为双人软式项目。为了避免统计和规则歧义，表单会阻止单人雪分制。"
  },
  {
    q: "双人赛里的单人局怎么处理？",
    a: "开始该局前选择双方实际出场选手。保存后本局数据归属到这些选手，而不是平均摊到整个队伍。"
  },
  {
    q: "手动录入结果报错先查什么？",
    a: "先查比赛双方、胜方、比分、每局模板、上场名单和个人数据格式。比分与胜方不一致、缺少单人局出场名单最常见。"
  },
  {
    q: "保存基础资料会不会清空头像？",
    a: "不会。头像通过独立上传接口保存，用户或队伍基础资料表单不会因为没有头像字段而把已有头像清空。"
  },
  {
    q: "队长可以改队伍成员吗？",
    a: "队长可以维护长期队伍名称和头像。赛事实际成员由每次报名重新选择，管理员可以在后台管理成员和队长。"
  },
  {
    q: "长期队伍为什么不固定成员？",
    a: "这是为了适应真实赛事中的替补、临时换人和不同规格赛事。长期队伍保留品牌和历史，赛事队伍保留当次成员快照。"
  },
  {
    q: "软式数据会影响段位吗？",
    a: "会。软式权重低于硬式，但如果一个人主要参加软式赛事，也会获得匹配水平的段位，只是上限会更克制。"
  },
  {
    q: "头像上传失败怎么办？",
    a: "确认文件是 JPEG、PNG 或 WebP，原图小于 8MB。登录过期时刷新并重新登录。管理员还需要确认 Supabase avatars bucket 已创建。"
  },
  {
    q: "现场网络断开怎么办？",
    a: "先不要重复提交成绩。恢复网络后刷新页面检查比赛状态；如果状态不一致，由管理员从后台手动复核并录入最终结果。"
  },
  {
    q: "为什么点击后感觉没有反应？",
    a: "涉及保存、上传、生成赛程等服务端操作时会等待数据库响应。普通导航和计分按钮已尽量做触摸优化，若持续卡顿应检查网络和开发服务日志。"
  },
  {
    q: "CODL 视觉还能在哪里维护？",
    a: "后台主题页面保留为维护入口；当前程序已固定采用 CODL 黑白蓝专属风格。"
  },
  {
    q: "上线前最重要的人工测试是什么？",
    a: "创建一场硬式自定义局制赛事、一场软式手动录入赛事、一次长期队伍报名，并完成一次成绩保存和个人中心统计检查。"
  }
];

export default async function HelpPage() {
  const platformName = defaultSiteTheme.platformName;

  return (
    <div className="grid gap-5 pb-20 lg:pb-0">
      <CodlPageHeader
        dark
        kicker="Help Center"
        title={`${platformName} 全功能说明`}
        description="这是一份面向真实赛事现场的操作手册。它覆盖选手、队长、计分员和管理员的完整路径，也列出上线前必须复核的功能点。"
        icon={<BookOpen className="h-6 w-6" aria-hidden />}
        art="pattern"
        actions={
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Shortcut href="#quick" label="快速开始" />
            <Shortcut href="#workflows" label="流程 SOP" />
            <Shortcut href="#checks" label="上线检查" />
            <Shortcut href="#qa" label="QA" />
          </div>
        }
      />

      <section id="quick" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {quickStart.map((item, index) => (
          <div key={item.title} className="rounded-lg border border-wire bg-surface p-4">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-board text-sm font-black text-white">
              {index + 1}
            </div>
            <h2 className="mt-4 text-lg font-black">{item.title}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-muted">{item.text}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3">
        <SectionHeader icon={BadgeCheck} eyebrow="Roles" title="按身份使用平台" />
        <div className="grid gap-3 lg:grid-cols-4">
          {roleGuides.map((role) => (
            <Card key={role.title} className="grid content-between gap-4">
              <div>
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-field text-board">
                  <role.icon className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="mt-4 text-xl font-black">{role.title}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-muted">{role.goal}</p>
                <ul className="mt-3 grid gap-2 text-sm font-semibold text-muted">
                  {role.items.map((item) => (
                    <CheckLine key={item}>{item}</CheckLine>
                  ))}
                </ul>
                <div className="mt-4 rounded-lg bg-field p-3">
                  <div className="text-xs font-black text-board">注意</div>
                  <ul className="mt-2 grid gap-1 text-xs font-semibold leading-5 text-muted">
                    {role.cautions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Link
                href={role.href}
                className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg bg-board px-4 text-sm font-bold text-white"
              >
                {role.action}
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section id="workflows" className="grid gap-3">
        <SectionHeader icon={ClipboardList} eyebrow="SOP" title="关键流程细则" />
        <div className="grid gap-3 lg:grid-cols-2">
          {workflows.map((workflow) => (
            <Card key={workflow.title}>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-field text-board">
                  <workflow.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-lg font-black">{workflow.title}</h3>
              </div>
              <ol className="mt-4 grid gap-2 text-sm font-semibold leading-6 text-muted">
                {workflow.steps.map((step, index) => (
                  <li key={step} className="grid grid-cols-[28px_1fr] gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-field text-xs font-black text-board">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      </section>

      <section id="features" className="grid gap-3">
        <SectionHeader icon={Trophy} eyebrow="Features" title="功能说明与验收点" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {featureGroups.map((group) => (
            <Card key={group.title}>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-field text-board">
                  <group.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-lg font-black">{group.title}</h3>
              </div>
              <ul className="mt-4 grid gap-2 text-sm font-semibold leading-6 text-muted">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="mt-4 rounded-lg border border-wire bg-field p-3">
                <div className="text-xs font-black text-board">验收点</div>
                <ul className="mt-2 grid gap-1 text-xs font-semibold leading-5 text-muted">
                  {group.checks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section id="examples" className="grid gap-3">
        <SectionHeader icon={ListChecks} eyebrow="Examples" title="典型场景示例" />
        <div className="grid gap-3 lg:grid-cols-2">
          {examples.map((example) => (
            <Card key={example.title}>
              <h3 className="text-lg font-black">{example.title}</h3>
              <p className="mt-2 text-sm font-semibold text-board">{example.result}</p>
              <ol className="mt-4 grid gap-2 text-sm font-semibold leading-6 text-muted">
                {example.steps.map((step, index) => (
                  <li key={step} className="grid grid-cols-[28px_1fr] gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-field text-xs font-black text-board">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      </section>

      <section id="checks" className="grid gap-3">
        <SectionHeader icon={ClipboardCheck} eyebrow="Launch" title="上市前最终检查" />
        <div className="grid gap-3 md:grid-cols-3">
          {releaseChecks.map((group) => (
            <Card key={group.title}>
              <h3 className="text-lg font-black">{group.title}</h3>
              <ul className="mt-4 grid gap-2 text-sm font-semibold text-muted">
                {group.items.map((item) => (
                  <CheckLine key={item}>{item}</CheckLine>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <SectionHeader icon={ImagePlus} eyebrow="Operations" title="比赛日现场清单" />
        <div className="grid gap-3 md:grid-cols-3">
          <CheckCard title="开赛前" items={["确认报名已关闭", "生成队伍与赛程", "检查每场比赛局制模板", "为软式比赛准备手动录入人员", "确认管理员账号和计分设备可用"]} />
          <CheckCard title="比赛中" items={["硬式使用计分器", "单人局选择上场选手", "软式记录个人数据", "异常结果先暂停确认", "避免重复提交同一场比赛"]} />
          <CheckCard title="赛后" items={["录入或确认成绩", "检查个人数据归属", "同步长期队伍历史", "查看后台统计和个人中心", "导出或备份关键结果"]} />
        </div>
      </section>

      <section className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-orange-950">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <h2 className="font-black">发布提醒</h2>
            <p className="mt-1 text-sm font-semibold leading-6">
              上线前至少完成一场硬式自定义局制赛事、一场软式手动录入赛事、一次长期队伍复用报名和一次头像上传。任何一项阻断失败，都不建议对外发布。
            </p>
          </div>
        </div>
      </section>

      <section id="qa" className="grid gap-3">
        <SectionHeader icon={CircleHelp} eyebrow="QA" title="常见问题" />
        <div className="grid gap-3 lg:grid-cols-2">
          {qa.map((item) => (
            <Card key={item.q}>
              <h3 className="text-base font-black">{item.q}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-muted">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function Shortcut({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/15 active:bg-white/15"
    >
      {label}
    </a>
  );
}

function SectionHeader({
  icon: Icon,
  eyebrow,
  title
}: {
  icon: IconType;
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-lg bg-field px-3 py-2 text-xs font-black uppercase tracking-wide text-board">
        <Icon className="h-4 w-4" aria-hidden />
        {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl font-black">{title}</h2>
    </div>
  );
}

function CheckLine({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-board" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function CheckCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <h3 className="text-lg font-black">{title}</h3>
      <ul className="mt-4 grid gap-2 text-sm font-semibold text-muted">
        {items.map((item) => (
          <CheckLine key={item}>{item}</CheckLine>
        ))}
      </ul>
    </Card>
  );
}
