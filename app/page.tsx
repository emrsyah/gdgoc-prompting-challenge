"use client"
import React from 'react'
import Image from 'next/image'
import { useQueryState } from 'nuqs'
import { useRouter } from 'next/navigation'

const Page = () => {
  const router = useRouter()
  const [selectedCardId, setSelectedCardId] = useQueryState('selectedImage')
  const [username, setUsername] = useQueryState('username')
  const [selectedFaculty, setSelectedFaculty] = useQueryState('selectedFaculty')

  const selectedCardIdNumber = selectedCardId ? parseInt(selectedCardId) : null

  const faculties = [
    { name: "Fakultas Informatika", color: "bg-yellow-50 border-yellow-200 text-yellow-800" },
    { name: "Fakultas Teknik Elektro", color: "bg-blue-50 border-blue-200 text-blue-800" },
    { name: "Fakultas Industri Kreatif", color: "bg-orange-50 border-orange-200 text-orange-800" },
    { name: "Fakultas Rekayasa Industri", color: "bg-green-50 border-green-700 text-green-800" },
    { name: "Fakultas Komunikasi Sosial", color: "bg-indigo-50 border-indigo-200 text-indigo-800" },
    { name: "Fakultas Ekonomi Bisnis", color: "bg-cyan-50 border-cyan-200 text-cyan-800" },
    { name: "Fakultas Industri Terapan", color: "bg-emerald-50 border-emerald-200 text-emerald-800" }
  ]


  // Helper to get a colour for score progress bar
  const scoreBarColor = (score: number) => {
    if (score >= 80) return 'bg-[#34A853]' // Google green
    if (score >= 60) return 'bg-[#FBBC05]' // Google yellow
    if (score >= 40) return 'bg-[#EA4335]' // Google red-ish (orange)
    return 'bg-red-500'
  }

  // Generate 12 demo cards and cycle through faculties as owners
  const cards = Array.from({ length: 12 }, (_, index) => {
    const faculty = faculties[index % faculties.length]
    return {
      id: index + 1,
      image: `/images/image-${index + 1}.png`,
      // image: `/images/image.png`,
      ownerFaculty: faculty.name,
      score: Math.floor(Math.random() * 101) // score 0-100
    }
  })

  // Build a leaderboard based on how many cards each faculty owns
  const leaderboard = faculties
    .map((faculty) => {
      const ownedCount = cards.filter((c) => c.ownerFaculty === faculty.name).length
      return {
        faculty: faculty.name,
        count: ownedCount,
        color: faculty.color
      }
    })
    .sort((a, b) => b.count - a.count)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }))

  return (
    <div className="min-h-screen bg-blue-50 py-8">
      <div className="container mx-auto px-4">
        {/* Title */}
        <h1 className="text-5xl font-pixelify font-bold text-center mb-12 text-yellow-500">
          GDGoC Prompting Challenge
        </h1>

        {/* Content Row: Cards left & Leaderboard right */}
        <div className="flex flex-col lg:flex-row gap-8 mb-12">
          {/* Cards Grid */}
          <div className="flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-4 gap-4">
              {cards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => setSelectedCardId(card.id.toString())}
                  className={`text-left cursor-pointer bg-white rounded-lg border transition-shadow duration-300 focus:outline-none w-full 
                    ${selectedCardIdNumber === card.id ? 'ring-4 ring-[#4285F4] shadow-lg' : 'shadow-sm hover:shadow-md hover:-translate-y-0.5'}
                    transform transition-transform`}
                >
                  {/* Card Image */}
                  <div className="relative h-36 bg-slate-50 rounded-t-lg overflow-hidden">
                    <Image
                      src={card.image}
                      alt={`Item ${card.id}`}
                      fill
                      className="object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `https://via.placeholder.com/300x200/e5e7eb/6b7280?text=Card+${card.id}`;
                      }}
                    />
                  </div>

                  {/* Card Content */}
                  <div className="p-3 space-y-1">
                    <h3 className="text-base font-semibold text-gray-800 font-pixelify">Items {card.id}</h3>
                    <div className="flex items-center justify-between text-sm font-pixelify">
                      <span className="text-gray-600">Faculty:</span>
                      <span
                        className={`font-medium px-2 py-0.5 rounded border ${faculties.find((f) => f.name === card.ownerFaculty)?.color}`}
                      >
                        {card.ownerFaculty}
                      </span>
                    </div>
                    {/* Score Bar */}
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-1">
                        <div
                          className={`h-1 rounded-full ${scoreBarColor(card.score)}`}
                          style={{ width: `${card.score}%` }}
                        />
                      </div>
                      <div className="text-right text-[10px] text-gray-500 mt-1">{card.score}/100</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Leaderboard */}
          <div className="w-full font-pixelify lg:w-80 xl:w-72">
            <h2 className="text-xl font-bold mb-4 text-blue-500 text-center lg:text-left">
              Faculty Leaderboard
            </h2>
            <div className="bg-white rounded-lg shadow-sm border divide-y">
              {leaderboard.map((entry) => (
                <div key={entry.rank} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-full text-sm font-semibold text-gray-700">
                      {entry.rank}
                    </div>
                    <span className={`text-sm font-medium ${entry.color}`}>{entry.faculty}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{entry.count} cards</span>
                </div>
              ))}
            </div>
            {/* Name Input */}
            <input
              type="text"
              value={username || ""}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name"
              className="mt-6 w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#4285F4]"
            />
            <select
            
              value={selectedFaculty || ''}
              onChange={(e) => {
                const newFaculty = e.target.value;
                setSelectedFaculty(newFaculty);
                const params = new URLSearchParams();
                params.set('selectedFaculty', newFaculty);
                if (sandboxData?.sandboxId) {
                  params.set('sandbox', sandboxData.sandboxId);
                }
                router.push(`/?${params.toString()}`);
              }}
              className="px-3 py-1.5 text-sm w-full mt-3 bg-white border border-gray-300 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-[#36322F] focus:border-transparent"
            >
              {faculties.map(faculty => (
                <option key={faculty.name} value={faculty.name}>
                  {faculty.name}
                  {/* {appConfig.ai.modelDisplayNames[model] || model`} */}
                </option>
              ))}
            </select>

            {/* Action button */}
            <button
              disabled={selectedCardId === null || username?.trim() === "" || !selectedFaculty}
              onClick={() => {
                const params = new URLSearchParams()
                if (selectedCardId) params.set('selectedImage', selectedCardId)
                if (username?.trim()) params.set('username', username.trim())
                if (selectedFaculty) params.set('selectedFaculty', selectedFaculty)
                router.push(`/sandbox?${params.toString()}`)
              }}
              className={`mt-4 w-full py-2 rounded-md font-semibold text-white transition-colors
                ${selectedCardId === null || username?.trim() === '' || !selectedFaculty ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#4285F4] hover:bg-[#357AE8] shadow-md'}
                `}
            >
              Play Now!
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Page