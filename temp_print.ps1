          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">{participantName}</h1>
            <p className="text-sm text-gray-500">Availability Rules</p>
          </div>
        </div>

        {/* botón + diálogo (cliente) */}
        <AddRuleButton
          participantId={Number(pid)}
          gridStart={gridStartHHMM}
          gridEnd={gridEndHHMM}
          allowedDays={daysIdx}
          minMinutes={grid.cell_size_min}
        />
        {!participantLinked && (
          <EditorInviteInline gridId={id} participantId={pid} />
        )}
      </div>
      
      {/* calendario con overlay de rules */}
      <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
        {/* header de días */}
        <div className="grid" style={{ gridTemplateColumns: `100px repeat(${DAY_COUNT}, 1fr)` }}>
