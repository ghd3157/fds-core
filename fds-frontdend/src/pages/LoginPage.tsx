export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 w-full max-w-md shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-2">FDS 관리자 로그인</h1>
        <p className="text-gray-400 mb-8 text-sm">Fraud Detection System</p>

        <form className="flex flex-col gap-4">
          <div>
            <label className="block text-gray-300 text-sm mb-1">아이디</label>
            <input
              type="text"
              placeholder="admin"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-gray-300 text-sm mb-1">비밀번호</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  )
}
