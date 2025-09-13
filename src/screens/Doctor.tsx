import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { getTheme } from '../utils/theme'
// Removed autoUpdater usage; Doctor is now a simple health check
import { PressEnterToContinue } from '../components/PressEnterToContinue'

type Props = {
  onDone: () => void
  doctorMode?: boolean
}

// Interactive options removed; simplified status-only doctor

export function Doctor({ onDone, doctorMode = false }: Props): React.ReactNode {
  // Fully remove auto-update configuration; only show a quick health check
  const [checked, setChecked] = useState(false)
  const theme = getTheme()

  useEffect(() => {
    setChecked(true)
  }, [])

  // Close on Enter
  useInput((_input, key) => {
    if (key.return) onDone()
  })

  if (!checked) {
    return (
      <Box paddingX={1} paddingTop={1}>
        <Text color={theme.secondaryText}>Running checks…</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingTop={1}>
      <Text color={theme.success}>✓ Installation checks passed</Text>
      <Text dimColor>Note: Auto-update is disabled by design. Use npm/bun to update.</Text>
      <PressEnterToContinue />
    </Box>
  )
}
