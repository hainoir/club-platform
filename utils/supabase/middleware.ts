import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // 銆愮郴缁熷涔狅細Session 鍒锋柊涓庝护鐗屼繚娲汇€?
    // 璋冪敤 getUser() 涓嶄粎浠呮槸鎷夸俊鎭紝瀹冧細鍦ㄨ儗鍚庢鏌ュ鏋?access_token 蹇繃鏈熶簡锛?
    // 灏辫嚜鍔ㄧ敤 refresh_token 鍘绘崲涓€涓柊浠ょ墝鍐欏叆 request.cookies锛屼繚鎸佺敤鎴风殑鐧诲綍鎬佹寔涔呮湁鏁堛€?
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // 銆愮郴缁熷涔狅細璺敱瀹堝崼 (Route Guarding)銆?
    // 瀹氫箟鍙湁鍐呴儴浜哄憳鍙鐨勫墠绔〉闈㈡暟缁勩€?
    const pathname = request.nextUrl.pathname
    const isProtectedRoute =
        pathname === '/' ||
        pathname.startsWith('/duty') ||
        pathname.startsWith('/members') ||
        pathname.startsWith('/events')

    if (!user && isProtectedRoute) {
        // 銆愮郴缁熷涔狅細鏈巿鏉冩嫤鎴笌韪㈠嚭銆?
        // 娌″甫鍚堟硶 Cookie 涔熸暍杩涢棬锛熸妸浣犲己鍒堕仯杩斿埌 /login 鐧诲綍鍓嶅彴銆?
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 銆愮郴缁熷涔狅細UX 閲嶅畾鍚戜紭鍖栥€?
    // 褰撶郴缁熸娴嬪埌纭洏閲屾湁鍚堟硶鐨勭櫥褰曞嚟璇佹椂锛屾嫤鎴敤鎴峰啀鍘荤‖闂?/login 鐨勮涓猴紝灏嗚€佺帺瀹剁洿鎺ラ€佸洖绠＄悊澶у巺銆?
    if (user && pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

