"use client";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4">
      <h1 className="text-3xl font-bold text-gray-900">Online Sign System</h1>
      <p className="max-w-xl text-center text-gray-600">
        管理 API で発行された fan / talent / sign の URL からご利用ください。ここではセットアップの確認に利用できます。
      </p>
      <p className="text-sm text-gray-500">
        詳細な利用方法はリポジトリ内の README.md を参照してください。
      </p>
    </main>
  );
}
