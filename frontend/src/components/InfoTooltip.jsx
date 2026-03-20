import * as Tooltip from '@radix-ui/react-tooltip'

/**
 * ⓘ icon that reveals citation + formula on hover.
 */
export default function InfoTooltip({ citation, formula }) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button className="text-gray-500 hover:text-gray-300 text-xs leading-none">ⓘ</button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="max-w-xs bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 shadow-xl z-50"
            sideOffset={6}
          >
            {formula && <p className="font-mono mb-2 text-white">{formula}</p>}
            {citation && <p className="text-gray-400 italic">{citation}</p>}
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
